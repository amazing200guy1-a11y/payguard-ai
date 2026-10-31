'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PayGuard } = require('./index');

/**
 * PayGuard Live Gateway Server
 * Exposes REST APIs, Real-time Server-Sent Events (SSE), and Human-in-the-Loop Approval UI.
 */

class PayGuardGatewayServer {
  constructor(port = 3000, config = {}) {
    this.port = port;
    this.guard = new PayGuard(config);
    this.sseClients = new Set();
    this.pendingApprovals = new Map(); // ticketId -> { intent, createdAt, expiresAt }
    this.approvalHmacSecret = config.hmacSecret || 'payguard_secret_signing_key_2026';
    this.server = null;
  }

  broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
      const pathname = parsedUrl.pathname;

      // 1. Dashboard UI
      if (pathname === '/' || pathname === '/index.html' || pathname === '/dashboard') {
        const htmlPath = path.join(__dirname, '..', 'dashboard.html');
        if (fs.existsSync(htmlPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(htmlPath).pipe(res);
          return;
        }
      }

      // 2. Server-Sent Events (SSE) Stream
      if (pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('event: connected\ndata: {"status":"connected"}\n\n');
        this.sseClients.add(res);
        req.on('close', () => this.sseClients.delete(res));
        return;
      }

      // Helper to parse JSON body
      const parseBody = () => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
        });
      });

      // 3. API: Status & Quotas
      if (pathname === '/api/status' && req.method === 'GET') {
        const spent = this.guard.circuitBreaker.getRolling24hTotalCents();
        const cap = this.guard.circuitBreaker.dailyBudgetLimitCents;
        const txCap = this.guard.circuitBreaker.maxTransactionCents;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ONLINE',
          mode: this.guard.gateway.simulationMode ? 'SIMULATION' : 'PAYPAL_LIVE_SANDBOX',
          maxTransactionCents: txCap,
          dailyBudgetLimitCents: cap,
          rolling24hSpentCents: spent,
          remainingDailyCents: Math.max(0, cap - spent),
          pendingApprovalsCount: this.pendingApprovals.size,
          auditHistoryCount: this.guard.getAuditLog().length
        }));
        return;
      }

      // 4. API: Agent Checkout Endpoint
      if (pathname === '/api/checkout' && req.method === 'POST') {
        try {
          const intent = await parseBody();
          
          // Check if it requires human approval ticket
          const requiresTicket = intent.totalCents > this.guard.circuitBreaker.maxTransactionCents && !intent.humanApprovalToken;
          if (requiresTicket) {
            const ticketId = 'TICKET_' + crypto.randomBytes(6).toString('hex').toUpperCase();
            const ticket = {
              ticketId,
              agentId: intent.agentId || 'agent_procurement',
              merchant: intent.merchantDomain || 'store.example.com',
              totalCents: intent.totalCents,
              amountFormatted: `$${(intent.totalCents / 100).toFixed(2)}`,
              items: intent.items || [],
              createdAt: Date.now(),
              expiresAt: Date.now() + 60000 // 60s expiration
            };

            this.pendingApprovals.set(ticketId, { intent, ticket });
            this.broadcastSSE('approval_required', ticket);

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'APPROVAL_REQUIRED',
              message: `Order amount ($${(intent.totalCents/100).toFixed(2)}) exceeds autonomous cap. Awaiting human manager signature.`,
              ticketId,
              expiresInSeconds: 60
            }));
            return;
          }

          // Execute through PayGuard
          const result = await this.guard.processAgentCheckout(intent, intent.humanApprovalToken);
          this.broadcastSSE('transaction_settled', result);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          this.broadcastSSE('transaction_blocked', { error: err.message });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, blocked: true, error: err.message }));
        }
        return;
      }

      // 5. API: Human-in-the-Loop Approve Ticket
      if (pathname.startsWith('/api/approvals/') && pathname.endsWith('/approve') && req.method === 'POST') {
        const parts = pathname.split('/');
        const ticketId = parts[3];
        const record = this.pendingApprovals.get(ticketId);

        if (!record) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ticket not found or expired' }));
          return;
        }

        // Generate HMAC signature token
        const signatureToken = crypto
          .createHmac('sha256', this.approvalHmacSecret)
          .update(ticketId + ':' + record.intent.totalCents)
          .digest('hex');

        try {
          const result = await this.guard.processAgentCheckout(record.intent, signatureToken);
          this.pendingApprovals.delete(ticketId);
          this.broadcastSSE('approval_granted', { ticketId, orderId: result.orderId });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status: 'APPROVED', result }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 6. API: Audit Log
      if (pathname === '/api/audit' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.guard.getAuditLog()));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🛡️  PayGuard Live Gateway running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) this.server.close();
  }
}

if (require.main === module) {
  const server = new PayGuardGatewayServer(process.env.PORT || 3000);
  server.start();
}

module.exports = { PayGuardGatewayServer };

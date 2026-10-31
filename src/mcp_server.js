'use strict';

const readline = require('readline');
const { PayGuard } = require('./index');

/**
 * PayGuard Model Context Protocol (MCP) Server
 * Exposes zero-trust PayPal checkout tools to LLMs (Claude Desktop, Cursor, LangChain)
 * via JSON-RPC 2.0 over standard I/O.
 */

class PayGuardMCPServer {
  constructor(config = {}) {
    this.guard = new PayGuard(config);
    this.pendingApprovals = new Map(); // ticketId -> { intent, resolve, reject, expiresAt }
  }

  start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const req = JSON.parse(trimmed);
        const res = await this.handleRequest(req);
        if (res) {
          process.stdout.write(JSON.stringify(res) + '\n');
        }
      } catch (err) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: ' + err.message }
        }) + '\n');
      }
    });
  }

  async handleRequest(req) {
    const { id, method, params } = req;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'payguard-ai-paypal-sentinel',
              version: '1.0.0'
            }
          }
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'paypal_guarded_checkout',
                description: 'Safely execute an authorized purchase using PayPal REST v2 with strict idempotency, financial minor-unit invariants, and spending circuit breakers. Fails closed if budget or vendor verification fails.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    merchantDomain: {
                      type: 'string',
                      description: 'Authorized merchant domain (e.g. store.example.com)'
                    },
                    totalCents: {
                      type: 'integer',
                      description: 'Exact integer amount in cents/minor units (e.g. 2500 for $25.00)'
                    },
                    currency: {
                      type: 'string',
                      default: 'USD',
                      description: 'Three-letter currency code (e.g. USD, EUR, GBP)'
                    },
                    memo: {
                      type: 'string',
                      description: 'Purpose of transaction'
                    },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          unitAmountCents: { type: 'integer' },
                          quantity: { type: 'integer' }
                        },
                        required: ['name', 'unitAmountCents', 'quantity']
                      }
                    },
                    humanApprovalToken: {
                      type: 'string',
                      description: 'Cryptographic token required if totalCents exceeds autonomous limit ($50.00)'
                    }
                  },
                  required: ['merchantDomain', 'totalCents', 'items']
                }
              },
              {
                name: 'paypal_check_spending_limits',
                description: 'Inspect current autonomous spending quotas, 24-hour remaining budget, and circuit-breaker status before attempting high-value purchases.',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          }
        };

      case 'tools/call':
        return await this.handleToolCall(id, params);

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  async handleToolCall(id, params) {
    const { name, arguments: args } = params;

    if (name === 'paypal_check_spending_limits') {
      const dailySpent = this.guard.circuitBreaker.getRolling24hTotalCents();
      const dailyCap = this.guard.circuitBreaker.dailyBudgetLimitCents;
      const txCap = this.guard.circuitBreaker.maxTransactionCents;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'ACTIVE',
                autonomousCapPerTransaction: `$${(txCap / 100).toFixed(2)}`,
                dailyBudgetCeiling: `$${(dailyCap / 100).toFixed(2)}`,
                dailySpentSoFar: `$${(dailySpent / 100).toFixed(2)}`,
                remainingDailyBudget: `$${((dailyCap - dailySpent) / 100).toFixed(2)}`,
                policy: 'Orders > $50.00 require humanApprovalToken signature'
              }, null, 2)
            }
          ]
        }
      };
    }

    if (name === 'paypal_guarded_checkout') {
      try {
        const receipt = await this.guard.processAgentCheckout(args, args.humanApprovalToken);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  status: receipt.status,
                  orderId: receipt.orderId,
                  amount: receipt.amountFormatted,
                  approvalUrl: receipt.approvalUrl,
                  idempotencyKey: receipt.idempotencyKey,
                  auditNotice: 'Protected by PayGuard Zero-Trust Sentinel'
                }, null, 2)
              }
            ]
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  blocked: true,
                  reason: err.message,
                  remediation: err.message.includes('exceeds maximum autonomous limit')
                    ? 'Request a human approval token from manager or reduce order total under $50.00'
                    : 'Transaction rejected by PayGuard financial invariants.'
                }, null, 2)
              }
            ]
          }
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: `Unknown tool: ${name}` }
    };
  }
}

if (require.main === module) {
  const server = new PayGuardMCPServer();
  server.start();
}

module.exports = { PayGuardMCPServer };

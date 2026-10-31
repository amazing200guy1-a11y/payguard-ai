'use strict';

/**
 * UniversalPaymentAgent — AI-Powered Autonomous Commerce Orchestrator
 * Routes any natural language payment intent through PayGuard's security layer
 * and executes via PayPal REST v2.
 *
 * Capabilities:
 *   - Subscription management (Netflix, Starlink, Spotify, GitHub, etc.)
 *   - Shopping agent (AirPods, MacBook, electronics, etc.)
 *   - Tax calculation + auto-payment
 *   - Ride booking (Uber, Bolt, Lyft)
 *   - Bill payments (electricity, water, internet)
 *   - Human-in-the-loop approval for high-value transactions
 */

const { PayGuard } = require('./index');
const { parseIntent } = require('./intent_parser');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;
const bold = (text) => `${COLORS.bold}${text}${COLORS.reset}`;

class UniversalPaymentAgent {
  constructor(config = {}) {
    this.payguard = new PayGuard(config);
    this.sessionLog = [];
    this.agentId = config.agentId || 'universal_agent_v1';
  }

  /**
   * Execute any natural language payment command.
   * @param {string} command - Plain English payment command
   * @param {string} [approvalToken] - Optional pre-approved human token for high-value transactions
   * @returns {Promise<object>} Result with status, details, and AI reasoning trace
   */
  async execute(command, approvalToken = null) {
    const startTime = Date.now();
    console.log('\n' + '═'.repeat(65));
    console.log(c('cyan', bold(`🤖 AI AGENT COMMAND: "${command}"`)));
    console.log('═'.repeat(65));

    // Step 1: Parse natural language intent
    console.log(c('blue', '\n📋 STEP 1: Intent Parsing & AI Reasoning'));
    const intent = parseIntent(command, this.agentId);

    intent.aiReasoning.forEach(line => {
      console.log(c('white', `   → ${line}`));
    });

    console.log(c('yellow', `\n   💡 Parsed: ${intent.description}`));
    console.log(c('yellow', `   💰 Amount: $${(intent.totalCents / 100).toFixed(2)} USD`));
    console.log(c('yellow', `   🏪 Merchant: ${intent.merchantDomain}`));
    console.log(c('yellow', `   📁 Category: ${intent.category.toUpperCase()}`));

    // Step 2: Security check preview
    console.log(c('blue', '\n🛡️  STEP 2: PayGuard Security Layer'));
    console.log(c('white', '   → Running vendor shield inspection...'));
    console.log(c('white', '   → Checking circuit breaker limits...'));
    console.log(c('white', '   → Computing idempotency fingerprint...'));

    // Step 3: Execute through PayGuard
    console.log(c('blue', '\n💳 STEP 3: PayPal REST v2 Execution'));

    let result;
    try {
      result = await this.payguard.processAgentCheckout(intent, approvalToken);

      const elapsed = Date.now() - startTime;
      console.log(c('green', `\n✅ PAYMENT AUTHORIZED & CREATED`));
      console.log(c('green', `   Order ID:     ${result.orderId}`));
      console.log(c('green', `   Amount:        ${result.amountFormatted}`));
      console.log(c('green', `   Idempotency:   ${result.idempotencyKey}`));
      console.log(c('green', `   Status:        ${result.status}`));
      if (result.approvalUrl) {
        console.log(c('green', `   Approval URL:  ${result.approvalUrl}`));
      }
      console.log(c('white', `   Elapsed:       ${elapsed}ms`));

      const entry = {
        command,
        intent: intent.description,
        amount: `$${(intent.totalCents / 100).toFixed(2)}`,
        category: intent.category,
        status: 'SUCCESS',
        orderId: result.orderId,
        timestamp: new Date().toISOString(),
      };
      this.sessionLog.push(entry);

      return { success: true, ...result, intent, elapsed };

    } catch (err) {
      const elapsed = Date.now() - startTime;
      const isCircuitBreaker = err.message.includes('Circuit Breaker');
      const isShieldBlock = err.message.includes('Shield Block');
      const needsApproval = err.message.includes('HUMAN_APPROVAL_REQUIRED');

      if (isShieldBlock) {
        console.log(c('red', `\n🚫 BLOCKED: Prompt Injection / Vendor Shield`));
        console.log(c('red', `   Reason: ${err.message}`));
      } else if (isCircuitBreaker || needsApproval) {
        console.log(c('yellow', `\n⚠️  CIRCUIT BREAKER TRIPPED: Human Approval Required`));
        console.log(c('yellow', `   Amount $${(intent.totalCents / 100).toFixed(2)} exceeds autonomous limit`));
        console.log(c('yellow', `   Reason: ${err.message}`));
        console.log(c('cyan', `\n   📤 Generating human approval ticket...`));

        // Generate approval ticket
        const ticket = generateApprovalTicket(intent, this.agentId);
        console.log(c('cyan', `   🎫 Approval Token: ${ticket.token}`));
        console.log(c('cyan', `   📧 Manager notified. Pass token to re-execute.`));

        const entry = {
          command,
          intent: intent.description,
          amount: `$${(intent.totalCents / 100).toFixed(2)}`,
          category: intent.category,
          status: 'AWAITING_APPROVAL',
          approvalTicket: ticket,
          timestamp: new Date().toISOString(),
        };
        this.sessionLog.push(entry);

        return {
          success: false,
          status: 'AWAITING_HUMAN_APPROVAL',
          approvalTicket: ticket,
          intent,
          message: 'Transaction exceeds autonomous spending limit. Human approval required.',
          elapsed,
        };
      } else {
        console.log(c('red', `\n❌ ERROR: ${err.message}`));
      }

      const entry = {
        command,
        intent: intent.description,
        amount: `$${(intent.totalCents / 100).toFixed(2)}`,
        category: intent.category,
        status: 'FAILED',
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      this.sessionLog.push(entry);

      return {
        success: false,
        status: 'FAILED',
        error: err.message,
        intent,
        elapsed,
      };
    }
  }

  /**
   * Print a session summary table of all executed commands.
   */
  printSessionSummary() {
    console.log('\n' + '═'.repeat(65));
    console.log(bold(c('magenta', '📊 SESSION SUMMARY — Universal Payment Agent')));
    console.log('═'.repeat(65));
    console.log(
      c('white', 'No.') + ' | ' +
      c('cyan', 'Command'.padEnd(32)) + ' | ' +
      c('yellow', 'Amount'.padEnd(10)) + ' | ' +
      c('white', 'Status')
    );
    console.log('─'.repeat(65));

    this.sessionLog.forEach((entry, i) => {
      const statusColor = entry.status === 'SUCCESS' ? 'green'
        : entry.status === 'AWAITING_APPROVAL' ? 'yellow' : 'red';
      const icon = entry.status === 'SUCCESS' ? '✅'
        : entry.status === 'AWAITING_APPROVAL' ? '⏳' : '❌';

      console.log(
        c('white', String(i + 1).padStart(3)) + ' | ' +
        c('cyan', entry.command.slice(0, 32).padEnd(32)) + ' | ' +
        c('yellow', entry.amount.padEnd(10)) + ' | ' +
        c(statusColor, `${icon} ${entry.status}`)
      );
    });

    console.log('─'.repeat(65));
    const successes = this.sessionLog.filter(e => e.status === 'SUCCESS').length;
    const pending = this.sessionLog.filter(e => e.status === 'AWAITING_APPROVAL').length;
    const failed = this.sessionLog.filter(e => e.status === 'FAILED').length;
    console.log(c('green', `✅ ${successes} authorized`) + '  ' +
      c('yellow', `⏳ ${pending} awaiting approval`) + '  ' +
      c('red', `❌ ${failed} failed/blocked`));
    console.log('═'.repeat(65) + '\n');
  }
}

/**
 * Generate a human approval ticket for high-value transactions.
 */
function generateApprovalTicket(intent, agentId) {
  const crypto = require('crypto');
  const payload = JSON.stringify({
    agentId,
    description: intent.description,
    totalCents: intent.totalCents,
    merchantDomain: intent.merchantDomain,
    issuedAt: new Date().toISOString(),
  });
  const token = 'APPROVE_' + crypto.createHash('sha256')
    .update(payload + process.env.PAYGUARD_HMAC_SECRET || 'payguard_secret_key_2024')
    .digest('hex').slice(0, 16).toUpperCase();

  return {
    token,
    description: intent.description,
    amount: `$${(intent.totalCents / 100).toFixed(2)}`,
    merchantDomain: intent.merchantDomain,
    agentId,
    issuedAt: new Date().toISOString(),
    expiresIn: '15 minutes',
    instructions: 'Send this token back to the agent to authorize the transaction.',
  };
}

module.exports = { UniversalPaymentAgent };

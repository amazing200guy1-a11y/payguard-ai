'use strict';

const { Currency } = require('./currency');
const { IdempotencyEngine } = require('./idempotency');
const { CircuitBreaker } = require('./circuit_breaker');
const { VendorShield } = require('./vendor_shield');
const { PayPalGateway } = require('./paypal_gateway');
const { scoreTransaction } = require('./risk_engine');

/**
 * PayGuard: Zero-Trust Autonomous Commerce Sentinel for AI Agents
 * Connects AI agent tools to PayPal with financial safety invariants.
 */

class PayGuard {
  constructor(config = {}) {
    this.currency = Currency;
    this.idempotency = new IdempotencyEngine(config.idempotency);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.vendorShield = new VendorShield(config.vendorShield);
    this.gateway = new PayPalGateway(config.paypal);
    this.auditLog = [];
  }

  /**
   * Main entry point for AI Agent Tool Execution.
   * Authorizes and safely routes checkout through PayPal.
   *
   * @param {object} intent - Order request from LLM agent
   * @param {string} [humanApprovalToken] - Optional token for transactions exceeding autonomous limits
   * @returns {Promise<object>} Execution receipt with status and checkout URLs
   */
  async processAgentCheckout(intent, humanApprovalToken = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      agentId: intent.agentId || 'anonymous_agent',
      totalCents: intent.totalCents,
      merchant: intent.merchantDomain || intent.merchantId,
      status: 'PENDING'
    };

    try {
      // 1. Strict Minor Currency Math Check
      if (!intent.totalCents || !Number.isInteger(intent.totalCents)) {
        throw new TypeError('Intent must specify totalCents as an exact integer (minor currency units).');
      }

      if (intent.items && intent.items.length > 0) {
        const itemsMatch = this.currency.validateLineItems(intent.items, intent.totalCents);
        if (!itemsMatch) {
          throw new RangeError('Financial Invariant Violation: Sum of line items does not equal order total.');
        }
      }

      // 2. Vendor Shield & Anti-Prompt-Injection Verification
      const shieldCheck = this.vendorShield.inspectPayload(intent);
      if (!shieldCheck.safe) {
        logEntry.status = 'BLOCKED_BY_VENDOR_SHIELD';
        logEntry.reason = shieldCheck.violation;
        this.auditLog.push(logEntry);
        throw new Error(`[PayGuard Shield Block]: ${shieldCheck.violation}`);
      }

      // 3. Autonomous Spending Circuit Breaker Evaluation
      const breakerCheck = this.circuitBreaker.evaluate(intent.totalCents, humanApprovalToken);
      if (!breakerCheck.allowed) {
        logEntry.status = 'TRIPPED_CIRCUIT_BREAKER';
        logEntry.reason = breakerCheck.reason;
        this.auditLog.push(logEntry);
        throw new Error(`[PayGuard Circuit Breaker Trip]: ${breakerCheck.reason}`);
      }

      // 4. ML Fraud Risk Score (Python ML Risk Engine)
      const riskAssessment = await scoreTransaction(intent);
      logEntry.mlRiskScore = riskAssessment.risk_score;
      logEntry.mlRiskLevel = riskAssessment.risk_level;

      if (riskAssessment.recommendation === 'BLOCK') {
        logEntry.status = 'BLOCKED_BY_ML_RISK_ENGINE';
        logEntry.reason = `ML Risk Score: ${riskAssessment.risk_score}/100 (${riskAssessment.risk_level}) - ${riskAssessment.top_factors[0]}`;
        this.auditLog.push(logEntry);
        throw new Error(`[PayGuard ML Block]: Risk score ${riskAssessment.risk_score}/100 - ${riskAssessment.top_factors.join(', ')}`);
      }

      if (riskAssessment.recommendation === 'REQUIRE_HUMAN_APPROVAL' && !humanApprovalToken) {
        logEntry.status = 'ML_FLAGGED_NEEDS_APPROVAL';
        logEntry.reason = `ML flagged HIGH risk (${riskAssessment.risk_score}/100): ${riskAssessment.top_factors[0]}`;
        this.auditLog.push(logEntry);
        throw new Error(`[PayGuard ML Flag]: High risk score ${riskAssessment.risk_score}/100 - human approval required. Factors: ${riskAssessment.top_factors.join(', ')}`);
      }

      // 5. Compute Cryptographic Idempotency Fingerprint
      const idempotencyKey = intent.idempotencyKey || this.idempotency.computeFingerprint(intent);

      // 5. Atomic Idempotency Gate
      const lock = await this.idempotency.acquire(idempotencyKey);
      if (lock.isDuplicate) {
        logEntry.status = 'IDEMPOTENT_REPLAY_SERVED';
        this.auditLog.push(logEntry);
        return {
          status: 'IDEMPOTENT_CACHED',
          message: 'Zero-duplicate guarantee: Previous settled order served without double-charging.',
          order: lock.previousResult
        };
      }

      // 6. Transmit to PayPal REST v2 with PayPal-Request-Id header
      let orderResult;
      try {
        orderResult = await this.gateway.createOrder(intent, idempotencyKey);
      } catch (err) {
        this.idempotency.rollback(idempotencyKey, err);
        throw err;
      }

      // 7. Commit Settlement & Record Audit History
      this.idempotency.commit(idempotencyKey, orderResult);
      this.circuitBreaker.recordSettlement(intent.totalCents);

      logEntry.status = 'AUTHORIZED_AND_CREATED';
      logEntry.orderId = orderResult.id;
      this.auditLog.push(logEntry);

      return {
        status: 'SUCCESS',
        orderId: orderResult.id,
        idempotencyKey,
        amountFormatted: `$${this.currency.toDollarString(intent.totalCents)}`,
        approvalUrl: (orderResult.links || []).find(l => l.rel === 'approve')?.href,
        mlRiskScore: riskAssessment.risk_score,
        mlRiskLevel: riskAssessment.risk_level,
        paypalOrder: orderResult
      };

    } catch (err) {
      logEntry.status = logEntry.status === 'PENDING' ? 'FAILED' : logEntry.status;
      logEntry.error = err.message;
      if (!this.auditLog.includes(logEntry)) this.auditLog.push(logEntry);
      throw err;
    }
  }

  getAuditLog() {
    return [...this.auditLog];
  }
}

module.exports = { PayGuard };

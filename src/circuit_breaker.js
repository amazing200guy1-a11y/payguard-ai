'use strict';

/**
 * Autonomous Spending Circuit Breaker: Hard Quota & Velocity Defense
 * Prevents rogue or runaway AI agents from draining user balances.
 */

class CircuitBreaker {
  constructor(config = {}) {
    this.maxTransactionCents = config.perTransactionLimitCents || config.maxTransactionCents || 5000;
    this.dailyBudgetLimitCents = config.dailyLimitCents || config.dailyBudgetLimitCents || 20000;
    this.maxVelocityPerMinute = config.maxVelocityPerMinute || 4;

    this.transactions = []; // { timestamp, amountCents }
    this.approvedTokens = new Set(); // Manager-approved tokens (used once)
  }

  /**
   * Assesses whether an agent checkout request exceeds safety boundaries.
   * @param {number} amountCents
   * @param {string} [humanApprovalToken]
   * @returns {{ allowed: boolean, reason?: string }}
   */
  evaluate(amountCents, humanApprovalToken = null) {
    this._pruneHistory();

    // 1. Hard per-transaction cap
    if (amountCents > this.maxTransactionCents && !humanApprovalToken) {
      return {
        allowed: false,
        reason: `Transaction amount ($${(amountCents / 100).toFixed(2)}) exceeds maximum autonomous limit ($${(this.maxTransactionCents / 100).toFixed(2)}). Human approval token required.`
      };
    }

    // 2. Rolling daily spending budget
    const currentDailyTotal = this.getRolling24hTotalCents();
    if (currentDailyTotal + amountCents > this.dailyBudgetLimitCents) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: Attempted total ($${((currentDailyTotal + amountCents) / 100).toFixed(2)}) exceeds 24-hour limit ($${(this.dailyBudgetLimitCents / 100).toFixed(2)}).`
      };
    }

    // 3. Execution velocity / runaway agent detection
    const oneMinuteAgo = Date.now() - 60000;
    const recentCount = this.transactions.filter(t => t.timestamp > oneMinuteAgo).length;
    if (recentCount >= this.maxVelocityPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit trip: Agent initiated ${recentCount + 1} orders within 60 seconds. Potential recursive agent loop halted.`
      };
    }

    return { allowed: true };
  }

  /**
   * Records a settled transaction into the rolling history.
   * @param {number} amountCents
   */
  recordSettlement(amountCents) {
    this.transactions.push({
      timestamp: Date.now(),
      amountCents
    });
  }

  getRolling24hTotalCents() {
    this._pruneHistory();
    return this.transactions.reduce((acc, t) => acc + t.amountCents, 0);
  }

  _pruneHistory() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.transactions = this.transactions.filter(t => t.timestamp > cutoff);
  }
}

module.exports = { CircuitBreaker };

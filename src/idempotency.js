'use strict';

const crypto = require('crypto');

/**
 * Idempotency Engine: Atomic Request Fingerprinting and Anti-Replay Gate
 * Guarantees zero duplicate charges when AI agents retry or loop across network drops.
 */

class IdempotencyEngine {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24 hour idempotency window
    this.records = new Map(); // key -> { state, result, timestamp, promise }
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for the transaction payload.
   * @param {object} payload
   * @returns {string} Hex hash
   */
  computeFingerprint(payload) {
    const canonical = {
      agentId: payload.agentId || 'anonymous_agent',
      merchantId: payload.merchantId || '',
      totalCents: payload.totalCents,
      currency: payload.currency || 'USD',
      items: (payload.items || []).map(i => ({
        sku: i.sku || i.name,
        qty: i.quantity,
        price: i.unitAmountCents
      })).sort((a, b) => a.sku.localeCompare(b.sku))
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Acquires an atomic idempotency lock before executing order creation.
   * @param {string} key - Idempotency key or fingerprint
   * @returns {Promise<{ isDuplicate: boolean, previousResult?: object }>}
   */
  async acquire(key) {
    this._cleanupExpired();

    const existing = this.records.get(key);
    if (existing) {
      if (existing.state === 'SETTLED') {
        return { isDuplicate: true, previousResult: existing.result };
      }
      if (existing.state === 'IN_FLIGHT') {
        // Wait for the in-flight request to settle instead of double-firing
        const settledResult = await existing.promise;
        return { isDuplicate: true, previousResult: settledResult };
      }
    }

    let resolvePromise, rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.records.set(key, {
      state: 'IN_FLIGHT',
      timestamp: Date.now(),
      promise,
      _resolve: resolvePromise,
      _reject: rejectPromise
    });

    return { isDuplicate: false };
  }

  /**
   * Commits a successful settlement to the idempotency record.
   * @param {string} key
   * @param {object} result
   */
  commit(key, result) {
    const record = this.records.get(key);
    if (record) {
      record.state = 'SETTLED';
      record.result = result;
      if (record._resolve) record._resolve(result);
    }
  }

  /**
   * Releases an in-flight lock on failure.
   * @param {string} key
   * @param {Error} error
   */
  rollback(key, error) {
    const record = this.records.get(key);
    if (record) {
      if (record._reject) record._reject(error);
      this.records.delete(key);
    }
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now - record.timestamp > this.ttlMs) {
        this.records.delete(key);
      }
    }
  }
}

module.exports = { IdempotencyEngine };

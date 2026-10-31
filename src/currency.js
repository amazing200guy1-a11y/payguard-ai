'use strict';

/**
 * Currency Utility: Strict Minor Unit (Cents) Financial Mathematics
 * Enforces zero-floating-point calculations to eliminate penny leakage (CWE-682).
 */

class Currency {
  /**
   * Converts a dollar string or float to exact integer minor units (cents).
   * @param {string|number} amount
   * @returns {number} Integer cents
   */
  static toCents(amount) {
    if (typeof amount === 'number') {
      if (Number.isInteger(amount)) return amount;
      amount = amount.toFixed(2);
    }
    if (typeof amount !== 'string') {
      throw new TypeError(`Invalid amount type: ${typeof amount}. Expected string or number.`);
    }

    const clean = amount.trim().replace(/^\$/, '');
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
      throw new RangeError(`Malformed currency value: "${amount}". Must be non-negative decimal.`);
    }

    const [dollars, cents = ''] = clean.split('.');
    const paddedCents = (cents + '00').slice(0, 2);
    return parseInt(dollars, 10) * 100 + parseInt(paddedCents, 10);
  }

  /**
   * Formats integer cents back to standard PayPal currency string (e.g. "49.99").
   * @param {number} cents
   * @returns {string}
   */
  static toDollarString(cents) {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new RangeError(`Cents must be a non-negative integer. Got: ${cents}`);
    }
    const dollars = Math.floor(cents / 100);
    const rem = cents % 100;
    return `${dollars}.${rem.toString().padStart(2, '0')}`;
  }

  /**
   * Validates that line items add up to the exact order total without penny drift.
   * @param {Array<{ name: string, unitAmountCents: number, quantity: number }>} items
   * @param {number} totalCents
   * @returns {boolean}
   */
  static validateLineItems(items, totalCents) {
    if (!Array.isArray(items)) throw new TypeError('Items must be an array');
    const computedTotal = items.reduce((acc, item) => {
      if (!Number.isInteger(item.unitAmountCents) || item.unitAmountCents < 0) {
        throw new RangeError(`Invalid unit amount: ${item.unitAmountCents}`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new RangeError(`Invalid quantity: ${item.quantity}`);
      }
      return acc + (item.unitAmountCents * item.quantity);
    }, 0);

    return computedTotal === totalCents;
  }
}

module.exports = { Currency };

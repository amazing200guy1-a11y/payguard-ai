'use strict';

const { Currency } = require('./currency');

/**
 * PayPal REST v2 Gateway Integration
 * Executes atomic order creation with native PayPal-Request-Id idempotency headers.
 */

class PayPalGateway {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
    this.isSandbox = config.sandbox !== false; // default true
    this.baseUrl = this.isSandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
    this.simulationMode = !this.clientId || !this.clientSecret;
  }

  /**
   * Generates or fetches an OAuth2 Access Token from PayPal.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    if (this.simulationMode) {
      return 'mock_access_token_' + Date.now();
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PayPal OAuth failed [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  /**
   * Creates an order with PayPal REST v2, transmitting our idempotency key.
   * @param {object} payload
   * @param {string} idempotencyKey
   * @returns {Promise<object>}
   */
  async createOrder(payload, idempotencyKey) {
    if (this.simulationMode) {
      // Deterministic simulation for local verification and offline testing
      return {
        id: 'SIM_PAYPAL_ORDER_' + idempotencyKey.slice(0, 12).toUpperCase(),
        status: 'CREATED',
        idempotencyKey,
        amount: Currency.toDollarString(payload.totalCents),
        currency: payload.currency || 'USD',
        create_time: new Date().toISOString(),
        links: [
          {
            href: `https://www.sandbox.paypal.com/checkoutnow?token=SIM_PAYPAL_ORDER_${idempotencyKey.slice(0, 12).toUpperCase()}`,
            rel: 'approve',
            method: 'GET'
          }
        ]
      };
    }

    const token = await this.getAccessToken();
    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: idempotencyKey.slice(0, 32),
          amount: {
            currency_code: payload.currency || 'USD',
            value: Currency.toDollarString(payload.totalCents),
            breakdown: {
              item_total: {
                currency_code: payload.currency || 'USD',
                value: Currency.toDollarString(payload.totalCents)
              }
            }
          },
          items: (payload.items || []).map(i => ({
            name: i.name,
            quantity: String(i.quantity),
            unit_amount: {
              currency_code: payload.currency || 'USD',
              value: Currency.toDollarString(i.unitAmountCents)
            }
          }))
        }
      ]
    };

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': idempotencyKey, // Atomic server-side PayPal idempotency
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(orderBody)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayPal Order Creation Failed [${res.status}]: ${err}`);
    }

    return await res.json();
  }
}

module.exports = { PayPalGateway };

'use strict';

/**
 * Vendor Shield: Merchant Domain Verification & Anti-Prompt-Injection Scanner
 * Protects autonomous agents against poisoned contexts and payee address spoofing.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(?:previous|all)\s+instructions/i,
  /system\s+prompt/i,
  /send\s+(?:all\s+funds|balance|crypto)/i,
  /update\s+(?:payee|recipient)\s+to/i,
  /<script[\s>]/i,
  /javascript:/i,
  /data:text\/html/i
];

class VendorShield {
  constructor(config = {}) {
    const defaultAllowedDomains = [
      // PayPal
      'paypal.com',
      // Subscriptions
      'netflix.com', 'spotify.com', 'starlink.com', 'youtube.com', 'hulu.com',
      'disneyplus.com', 'openai.com', 'github.com', 'notion.so', 'figma.com',
      'dropbox.com', 'adobe.com', 'microsoft.com', 'apple.com', 'icloud.com',
      // Shopping
      'amazon.com', 'sony.com', 'samsung.com', 'keychron.com', 'logitech.com',
      'dell.com', 'bestbuy.com',
      // Transport
      'uber.com', 'bolt.eu', 'lyft.com',
      // Bills & Tax
      'utility.com', 'isp.com', 'irs.gov',
      // Dev/demo
      'store.example.com', 'acme-corp.com', 'merchant.com',
    ];
    this.allowedDomains = new Set(config.allowedDomains || defaultAllowedDomains);
    this.enforceStrictWhitelist = config.enforceStrictWhitelist !== false;
  }

  /**
   * Scans transaction metadata for adversarial prompt injections.
   * @param {object} payload
   * @returns {{ safe: boolean, violation?: string }}
   */
  inspectPayload(payload) {
    const textFields = [
      payload.memo,
      payload.customId,
      ...(payload.items || []).map(i => `${i.name} ${i.description || ''}`)
    ].filter(Boolean);

    for (const text of textFields) {
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(text)) {
          return {
            safe: false,
            violation: `Prompt injection signature detected matching pattern ${pattern}: "${text.slice(0, 80)}..."`
          };
        }
      }
    }

    // Merchant domain verification
    if (this.enforceStrictWhitelist && payload.merchantDomain) {
      const domain = payload.merchantDomain.toLowerCase().trim();
      if (!this.allowedDomains.has(domain)) {
        return {
          safe: false,
          violation: `Unverified merchant domain: "${domain}" is not in the authorized vendor whitelist.`
        };
      }
    }

    return { safe: true };
  }
}

module.exports = { VendorShield };

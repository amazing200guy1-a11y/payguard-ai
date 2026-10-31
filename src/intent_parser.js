'use strict';

/**
 * IntentParser — Natural Language Payment Intent Engine
 * Converts plain English commands into structured PayGuard intents.
 * Supports: subscriptions, shopping, tax payments, ride booking, bill payments.
 */

const SUBSCRIPTION_CATALOG = {
  netflix: { name: 'Netflix Basic', amount: 699, domain: 'netflix.com', category: 'subscription' },
  'netflix basic': { name: 'Netflix Basic', amount: 699, domain: 'netflix.com', category: 'subscription' },
  'netflix standard': { name: 'Netflix Standard', amount: 1549, domain: 'netflix.com', category: 'subscription' },
  'netflix premium': { name: 'Netflix Premium', amount: 2299, domain: 'netflix.com', category: 'subscription' },
  starlink: { name: 'Starlink Internet', amount: 12000, domain: 'starlink.com', category: 'subscription' },
  'starlink residential': { name: 'Starlink Residential', amount: 12000, domain: 'starlink.com', category: 'subscription' },
  spotify: { name: 'Spotify Premium', amount: 999, domain: 'spotify.com', category: 'subscription' },
  'spotify premium': { name: 'Spotify Premium', amount: 999, domain: 'spotify.com', category: 'subscription' },
  youtube: { name: 'YouTube Premium', amount: 1399, domain: 'youtube.com', category: 'subscription' },
  'youtube premium': { name: 'YouTube Premium', amount: 1399, domain: 'youtube.com', category: 'subscription' },
  hulu: { name: 'Hulu (No Ads)', amount: 1799, domain: 'hulu.com', category: 'subscription' },
  disney: { name: 'Disney+ Basic', amount: 799, domain: 'disneyplus.com', category: 'subscription' },
  'disney+': { name: 'Disney+ Basic', amount: 799, domain: 'disneyplus.com', category: 'subscription' },
  chatgpt: { name: 'ChatGPT Plus', amount: 2000, domain: 'openai.com', category: 'subscription' },
  'chatgpt plus': { name: 'ChatGPT Plus', amount: 2000, domain: 'openai.com', category: 'subscription' },
  github: { name: 'GitHub Pro', amount: 400, domain: 'github.com', category: 'subscription' },
  'github pro': { name: 'GitHub Pro', amount: 400, domain: 'github.com', category: 'subscription' },
  notion: { name: 'Notion Plus', amount: 800, domain: 'notion.so', category: 'subscription' },
  figma: { name: 'Figma Professional', amount: 1200, domain: 'figma.com', category: 'subscription' },
  dropbox: { name: 'Dropbox Plus', amount: 999, domain: 'dropbox.com', category: 'subscription' },
  adobe: { name: 'Adobe Creative Cloud', amount: 5499, domain: 'adobe.com', category: 'subscription' },
  'microsoft 365': { name: 'Microsoft 365 Personal', amount: 699, domain: 'microsoft.com', category: 'subscription' },
  office: { name: 'Microsoft 365 Personal', amount: 699, domain: 'microsoft.com', category: 'subscription' },
  icloud: { name: 'iCloud+ 50GB', amount: 99, domain: 'apple.com', category: 'subscription' },
};

const SHOPPING_CATALOG = {
  airpods: { name: 'Apple AirPods Pro (2nd Gen)', amount: 24900, domain: 'apple.com', category: 'shopping' },
  'airpods pro': { name: 'Apple AirPods Pro (2nd Gen)', amount: 24900, domain: 'apple.com', category: 'shopping' },
  iphone: { name: 'iPhone 15 Pro', amount: 99900, domain: 'apple.com', category: 'shopping' },
  macbook: { name: 'MacBook Air M2', amount: 109900, domain: 'apple.com', category: 'shopping' },
  'samsung tv': { name: 'Samsung 55" 4K TV', amount: 59900, domain: 'samsung.com', category: 'shopping' },
  headphones: { name: 'Sony WH-1000XM5 Headphones', amount: 34900, domain: 'sony.com', category: 'shopping' },
  'mechanical keyboard': { name: 'Keychron K8 Mechanical Keyboard', amount: 9900, domain: 'keychron.com', category: 'shopping' },
  mouse: { name: 'Logitech MX Master 3 Mouse', amount: 9900, domain: 'logitech.com', category: 'shopping' },
  monitor: { name: 'Dell 27" 4K Monitor', amount: 44900, domain: 'dell.com', category: 'shopping' },
  ipad: { name: 'iPad Air M1', amount: 59900, domain: 'apple.com', category: 'shopping' },
  kindle: { name: 'Kindle Paperwhite', amount: 13999, domain: 'amazon.com', category: 'shopping' },
};

const RIDE_CATALOG = {
  uber: { name: 'Uber Ride', amount: 1500, domain: 'uber.com', category: 'transport' },
  bolt: { name: 'Bolt Ride', amount: 800, domain: 'bolt.eu', category: 'transport' },
  lyft: { name: 'Lyft Ride', amount: 1200, domain: 'lyft.com', category: 'transport' },
};

const BILL_CATALOG = {
  electricity: { name: 'Electricity Bill', amount: 5000, domain: 'utility.com', category: 'bill' },
  water: { name: 'Water Bill', amount: 2000, domain: 'utility.com', category: 'bill' },
  internet: { name: 'Internet Bill', amount: 4500, domain: 'isp.com', category: 'bill' },
};

/**
 * Parse a natural language payment command into a structured intent.
 * @param {string} text — Plain English command
 * @param {string} [agentId] — ID of the calling agent
 * @returns {object} Parsed intent ready for PayGuard.processAgentCheckout()
 */
function parseIntent(text, agentId = 'nlp_agent') {
  const lower = text.toLowerCase().trim();
  const reasoning = [];

  reasoning.push(`Input received: "${text}"`);

  // --- STEP 1: Detect intent type ---
  const isTax = /\b(tax|vat|income tax|self.assessment|filing)\b/.test(lower);
  const isSubscription = /\b(subscribe|subscription|plan|renew|pay for my|sign up for)\b/.test(lower)
    || Object.keys(SUBSCRIPTION_CATALOG).some(k => lower.includes(k));
  const isRide = /\b(ride|uber|bolt|lyft|book a cab|book a ride|take a)\b/.test(lower);
  const isBill = /\b(electricity|water bill|internet bill|utility)\b/.test(lower);
  const isShopping = /\b(buy|purchase|order|get me|shop for|checkout)\b/.test(lower)
    || Object.keys(SHOPPING_CATALOG).some(k => lower.includes(k));

  // --- STEP 2: Extract product / service ---
  let matched = null;
  let category = 'general';

  if (isTax) {
    category = 'tax';
    reasoning.push('Intent type: TAX PAYMENT');
    const income = extractAmount(lower) || 50000; // default $500 estimated tax
    const taxAmount = computeTax(income);
    reasoning.push(`Estimated tax on income $${income / 100}: $${taxAmount / 100}`);
    return buildIntent(agentId, {
      name: 'Tax Filing Payment',
      amount: taxAmount,
      domain: 'irs.gov',
      category: 'tax',
    }, text, reasoning, { incomeEstimate: income, taxRate: '22%' });
  }

  if (isSubscription) {
    category = 'subscription';
    reasoning.push('Intent type: SUBSCRIPTION');
    for (const [key, item] of Object.entries(SUBSCRIPTION_CATALOG)) {
      if (lower.includes(key)) {
        matched = item;
        reasoning.push(`Matched subscription: ${item.name} @ $${item.amount / 100}/mo`);
        break;
      }
    }
  }

  if (!matched && isRide) {
    category = 'transport';
    reasoning.push('Intent type: RIDE BOOKING');
    for (const [key, item] of Object.entries(RIDE_CATALOG)) {
      if (lower.includes(key)) {
        matched = item;
        reasoning.push(`Matched ride service: ${item.name}`);
        break;
      }
    }
    if (!matched) {
      matched = RIDE_CATALOG.uber; // default ride
      reasoning.push('Defaulted to Uber ride estimate');
    }
  }

  if (!matched && isBill) {
    category = 'bill';
    reasoning.push('Intent type: BILL PAYMENT');
    for (const [key, item] of Object.entries(BILL_CATALOG)) {
      if (lower.includes(key)) {
        matched = item;
        reasoning.push(`Matched bill: ${item.name}`);
        break;
      }
    }
  }

  if (!matched && isShopping) {
    category = 'shopping';
    reasoning.push('Intent type: SHOPPING');
    for (const [key, item] of Object.entries(SHOPPING_CATALOG)) {
      if (lower.includes(key)) {
        matched = item;
        reasoning.push(`Matched product: ${item.name} @ $${item.amount / 100}`);
        break;
      }
    }
  }

  // --- STEP 3: Try to extract explicit dollar amount ---
  const explicitAmount = extractAmount(lower);
  if (explicitAmount && matched) {
    reasoning.push(`Explicit amount override: $${explicitAmount / 100} (was $${matched.amount / 100})`);
    matched = { ...matched, amount: explicitAmount };
  }

  // --- STEP 4: Fallback for unknown commands ---
  if (!matched) {
    const amount = explicitAmount || 1000;
    matched = {
      name: `General Payment: "${text.slice(0, 40)}"`,
      amount,
      domain: 'merchant.com',
      category: 'general',
    };
    reasoning.push(`No specific match found. Fallback payment of $${amount / 100}.`);
  }

  return buildIntent(agentId, matched, text, reasoning);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractAmount(text) {
  // Only extract amounts explicitly preceded by $ sign to avoid false positives like "M2", "iPhone 15"
  const m = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (m) return Math.round(parseFloat(m[1]) * 100);
  return null;
}

function computeTax(incomeCents) {
  // Simple US federal estimate: 22% bracket above $44,725
  const income = incomeCents / 100;
  if (income <= 11000) return Math.round(income * 0.10 * 100);
  if (income <= 44725) return Math.round((1100 + (income - 11000) * 0.12) * 100);
  if (income <= 95375) return Math.round((5147 + (income - 44725) * 0.22) * 100);
  return Math.round((16290 + (income - 95375) * 0.24) * 100);
}

function buildIntent(agentId, item, rawText, reasoning, extra = {}) {
  return {
    agentId,
    merchantId: item.domain.replace(/\./g, '_'),
    merchantDomain: item.domain,
    description: item.name,
    totalCents: item.amount,
    currency: 'USD',
    category: item.category,
    rawCommand: rawText,
    items: [{
      name: item.name,
      quantity: 1,
      unitCents: item.amount,
    }],
    aiReasoning: reasoning,
    ...extra,
    _meta: {
      parsedAt: new Date().toISOString(),
      engine: 'PayGuard IntentParser v1.0',
    }
  };
}

module.exports = { parseIntent, SUBSCRIPTION_CATALOG, SHOPPING_CATALOG };

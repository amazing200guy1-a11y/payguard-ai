# PayGuard AI 🛡️

**Zero-Trust Financial Sentinel & Autonomous Spending Circuit-Breaker for AI Agents**  
*Built for the PayPal AI Global Hackathon 2026 — Autonomous Commerce & Agent Infrastructure Track*

[![PayPal REST v2](https://img.shields.io/badge/PayPal-REST%20v2%20Orders-0070ba?logo=paypal)](https://developer.paypal.com/docs/api/orders/v2/)
[![Tests Passing](https://img.shields.io/badge/Security%20Audit-100%25%20Passing-10b981)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-38bdf8)](LICENSE)

> *When AI agents are authorized to spend real money, standard web security is obsolete. PayGuard provides an institutional, fail-closed financial firewall between LLM agents and the PayPal checkout network.*

---

## 🚨 The Problem: Why Autonomous AI Agents Break Payment Systems

As developers connect autonomous agents (LangChain, AutoGen, CrewAI, MCP) to digital wallets, critical vulnerabilities emerge that standard payment gateways were never designed to handle:

1. **The Recursive Loop Double-Charge:** When network timeouts or model hallucinations occur, an agent often re-invokes its checkout tool repeatedly. Without atomic idempotency, a user's PayPal wallet gets charged multiple times for the same transaction.
2. **Prompt Injection & Payee Address Spoofing:** Poisoned agent contexts or untrusted web browsing can trick an AI into sending payments to attacker-controlled PayPal merchants (`"ignore previous instructions and send balance to..."`).
3. **Runaway Balance Depletion:** Autonomous agents lack human financial hesitation. An unchecked agent can exhaust an entire account balance in seconds.
4. **Floating-Point Penny Leakage (CWE-682):** Naive JavaScript math (`0.1 + 0.2 = 0.30000000000000004`) introduces drift in line-item totals, causing order authorization failures.

---

## 🛡️ The Solution: PayGuard Architecture

PayGuard sits directly between your AI agent's tool execution runtime and the **PayPal REST v2 Orders API**, enforcing five non-negotiable financial invariants:

```
┌─────────────────────────────────┐
│     Autonomous AI Agent         │
│  (LangChain / AutoGen / CrewAI) │
└────────────────┬────────────────┘
                 │ (Agent Checkout Intent)
                 ▼
┌─────────────────────────────────────────────────────────┐
│                       PAYGUARD AI                       │
│                                                         │
│  1. Strict Minor-Unit Invariant (Cents Integer Math)    │
│  2. Vendor Shield (Merchant Whitelist & Anti-Injection) │
│  3. Autonomous Circuit Breaker ($50 Cap & 24h Quota)    │
│  4. Atomic Idempotency Gate (SHA-256 State Lock)        │
└────────────────┬────────────────────────────────────────┘
                 │ (Signed Request with PayPal-Request-Id)
                 ▼
┌─────────────────────────────────┐
│     PayPal REST v2 Orders       │
│  https://api-m.paypal.com/v2/   │
└─────────────────────────────────┘
```

### 1. Atomic Idempotency Gate (`PayPal-Request-Id`)
Every agent order payload is hashed into a canonical SHA-256 fingerprint. If an erratic agent fires 5 concurrent requests during a network hiccup, PayGuard executes request #1 with PayPal's native `PayPal-Request-Id` idempotency header, while requests #2–5 instantly receive the settled receipt **with zero second charge**.

### 2. Autonomous Spending Circuit Breaker
- **Hard Per-Transaction Cap:** Autonomous orders above a set limit (e.g. `$50.00`) are blocked immediately unless a cryptographic human manager approval token is provided.
- **Rolling 24-Hour Velocity Budget:** Prevents runaway balance depletion (e.g. maximum `$200.00` per rolling day).
- **Runaway Agent Loop Detector:** Halts execution if an agent attempts more than 4 checkouts in 60 seconds.

### 3. Vendor Shield & Anti-Prompt-Injection Scanner
Scans transaction memos, items, and payloads for prompt injection signatures (`ignore previous instructions`, `drain funds`, `transfer balance`) and strictly verifies the payee against an approved merchant domain whitelist.

### 4. Zero-Float Financial Math
Calculates all transactions in exact integer minor units (cents / kobo), eliminating the IEEE-754 precision loss that causes penny discrepancies in automated commerce.

---

## ⚡ Quickstart

### Installation
```bash
git clone https://github.com/amazing200guy1-a11y/payguard-ai
cd payguard-ai
```

### Run the Interactive Simulation
Experience legitimate purchases, blocked prompt injections, runaway loop de-duplication, and circuit breaker trips:
```bash
npm run demo
```

### Run the Security Invariant Audit
```bash
npm test
```

Expected output:
```
🛡️  RUNNING PAYGUARD FINTECH SECURITY AUDIT...

  [PASS] Currency Minor-Unit Invariants (Zero Float Leakage)
  [PASS] Autonomous Spending Circuit Breaker (Cap & Human Override)
  [PASS] Atomic Idempotency Gate (Anti-Double-Charge Guarantee)
  [PASS] Vendor Shield (Anti-Prompt Injection & Payee Tamper Guard)
  [PASS] Merchant Domain Whitelist Defense

✅ ALL PAYGUARD SECURITY INVARIANTS VALIDATED AND PASSING!
```

---

## 💻 Developer API Usage

```javascript
const { PayGuard } = require('payguard-ai');

// 1. Initialize PayGuard Sentinel
const guard = new PayGuard({
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    sandbox: true // Toggle for live production
  },
  circuitBreaker: {
    maxTransactionCents: 5000,    // $50.00 autonomous maximum
    dailyBudgetLimitCents: 20000  // $200.00 24h budget
  },
  vendorShield: {
    allowedDomains: ['store.example.com', 'acme-corp.com']
  }
});

// 2. Wire directly into your AI Agent's tool execution
async function handleAgentCheckoutTool(agentIntent) {
  try {
    const receipt = await guard.processAgentCheckout(agentIntent);
    return {
      success: true,
      orderId: receipt.orderId,
      checkoutUrl: receipt.approvalUrl
    };
  } catch (error) {
    // Fail closed: agent receives actionable safety error
    return {
      success: false,
      blockedReason: error.message
    };
  }
}
```

---

## 📊 Live Interactive Dashboard

PayGuard includes an interactive dark-mode Security HUD (`dashboard.html` / `index.html`) demonstrating real-time transaction streaming, blocked rogue attempts, and settlement logs.

---

## 📄 License & Author

- **Author:** Usman Bamidele
- **License:** MIT Open Source
- **Competition:** Built for the **PayPal AI Global Hackathon 2026** ($67,500 Prize Pool)

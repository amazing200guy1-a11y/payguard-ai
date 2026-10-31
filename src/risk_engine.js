'use strict';

/**
 * RiskEngine — Node.js bridge to Python ML fraud scorer
 * Spawns the Python risk_scorer.py as a child process,
 * pipes transaction JSON in, reads risk assessment JSON out.
 */

const { spawn } = require('child_process');
const path = require('path');

const SCORER_PATH = path.join(__dirname, '..', 'risk_engine', 'risk_scorer.py');

/**
 * Score a transaction using the Python GradientBoosting ML model.
 * @param {object} intent - PayGuard intent object
 * @returns {Promise<object>} Risk assessment
 */
async function scoreTransaction(intent) {
  return new Promise((resolve) => {
    const payload = {
      amount_usd: (intent.totalCents || 0) / 100,
      category: intent.category || 'general',
      velocity_1h: intent.velocityCount || 0,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
    };

    const py = spawn('python', [SCORER_PATH], {
      timeout: 10000,
    });

    let output = '';
    let error = '';

    py.stdout.on('data', (data) => { output += data.toString(); });
    py.stderr.on('data', (data) => { error += data.toString(); });

    py.on('close', (code) => {
      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch {
        // Fallback if Python fails — don't block the payment
        resolve({
          risk_score: 25,
          risk_level: 'LOW',
          recommendation: 'APPROVE',
          top_factors: ['ML engine unavailable — rule-based fallback active'],
          error: error || 'parse_error',
        });
      }
    });

    py.on('error', () => {
      resolve({
        risk_score: 25,
        risk_level: 'LOW',
        recommendation: 'APPROVE',
        top_factors: ['Python runtime unavailable — rule-based guards still active'],
      });
    });

    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

module.exports = { scoreTransaction };

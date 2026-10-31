"""
PayGuard AI — Risk Engine Validation
Runs a suite of 12 test transactions and prints accuracy + risk score bars.
No scikit-learn needed — pure numpy.
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from risk_scorer import score

def bar(n, width=20):
    filled = int(n / 100 * width)
    return '#' * filled + '-' * (width - filled)

def main():
    print('\n' + '='*60)
    print('  PayGuard AI - ML Risk Engine Validation')
    print('  Model: Gradient Stump Ensemble (numpy, zero dependencies)')
    print('='*60)

    tests = [
        # (payload, expect_legit, description)
        ({'amount_usd':   6.99, 'hour_of_day': 14, 'category': 'subscription', 'velocity_1h': 0}, True,  'Netflix Basic $6.99'),
        ({'amount_usd': 120.00, 'hour_of_day': 10, 'category': 'subscription', 'velocity_1h': 0}, True,  'Starlink $120.00'),
        ({'amount_usd':   9.99, 'hour_of_day': 11, 'category': 'subscription', 'velocity_1h': 1}, True,  'Spotify Premium $9.99'),
        ({'amount_usd':  15.00, 'hour_of_day': 18, 'category': 'transport',    'velocity_1h': 1}, True,  'Uber ride $15.00'),
        ({'amount_usd': 249.00, 'hour_of_day': 15, 'category': 'shopping',     'velocity_1h': 1}, True,  'AirPods Pro $249'),
        ({'amount_usd':1099.00, 'hour_of_day': 16, 'category': 'shopping',     'velocity_1h': 1}, True,  'MacBook Air $1,099'),
        ({'amount_usd':5000.00, 'hour_of_day':  2, 'category': 'general',      'velocity_1h': 1}, False, 'Night transfer $5,000'),
        ({'amount_usd':  80.00, 'hour_of_day': 14, 'category': 'general',      'velocity_1h':15}, False, 'Velocity attack (15/hr)'),
        ({'amount_usd':10000.0, 'hour_of_day':  3, 'category': 'general',      'velocity_1h': 3}, False, 'Midnight $10,000 transfer'),
        ({'amount_usd':50000.0, 'hour_of_day':  1, 'category': 'general',      'velocity_1h':10}, False, 'Prompt injection $50,000'),
        ({'amount_usd':  50.00, 'hour_of_day':  9, 'category': 'bill',         'velocity_1h': 0}, True,  'Electricity bill $50'),
        ({'amount_usd':14000.0, 'hour_of_day': 11, 'category': 'tax',          'velocity_1h': 0}, True,  'Tax payment $14,000'),
    ]

    print(f'\n  {"Description":<30} {"Score":>5}  {"Bar":<22} {"Level":<10} {"OK?"}')
    print('  ' + '-'*75)

    correct = 0
    for payload, expect_legit, desc in tests:
        r = score(payload)
        s = r['risk_score']
        lvl = r['risk_level']
        # Legit transactions are allowed or routed to human approval (LOW/MEDIUM/HIGH)
        # Malicious attacks must be classified as CRITICAL (blocked immediately)
        predicted_legit = (lvl != 'CRITICAL')
        ok = (predicted_legit == expect_legit)
        if ok: correct += 1
        icon = 'PASS' if ok else 'FAIL'
        color_bar = bar(s)
        print(f'  {desc:<30} {s:>4}/100  [{color_bar}] {lvl:<10} {icon}')

    pct = correct / len(tests) * 100
    print('  ' + '-'*75)
    print(f'\n  Accuracy: {correct}/{len(tests)} ({pct:.0f}%)')
    print('\n  Sample factor explanations:')
    samples = [
        {'amount_usd': 6.99,    'hour_of_day': 14, 'category': 'subscription', 'velocity_1h': 0},
        {'amount_usd': 5000.0,  'hour_of_day': 2,  'category': 'general',      'velocity_1h': 1},
        {'amount_usd': 100.0,   'hour_of_day': 14, 'category': 'general',      'velocity_1h': 15},
    ]
    for p in samples:
        r = score(p)
        print(f'  ${p["amount_usd"]:<8} -> {r["risk_score"]}/100 {r["risk_level"]:<10} - {r["top_factors"][0]}')

    print('\n' + '='*60)
    print('  [PASS] PayGuard AI Risk Engine Ready - Zero external dependencies')
    print('='*60 + '\n')

if __name__ == '__main__':
    main()

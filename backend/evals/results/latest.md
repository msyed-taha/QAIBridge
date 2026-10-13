# QAIbridge AI evaluation

2026-10-13T12:05:10+00:00 · model claude-haiku-5-5 · 90 AI requests · $0.0175 · 60.0 s

## Describe a circuit

- Right circuit (the simulator gives the asked-for chances): **30 of 30 (100%)**
- Its own expected chances agreed with the simulator: 30 of 30 (100%)
- When the circuit was wrong, the check warned: 0 of 0
- Off-topic requests turned away: 2 of 2 (100%)


## AI Advisor, AI reader

- Right category and a sound quantum algorithm: **18 of 20 (90%)**
- Right category: 20 of 20 (100%)
- Sound quantum algorithm: 18 of 20 (90%)
- Off-topic requests turned away: 2 of 2 (100%)

  - wrong: `rsa` (Cryptography, qpe)
  - wrong: `ecc` (Cryptography, grovers)

## AI Advisor, built-in keyword reader

- Right category and a sound quantum algorithm: **14 of 20 (70%)**
- Right category: 14 of 20 (70%)
- Sound quantum algorithm: 14 of 20 (70%)
- Off-topic requests turned away: 2 of 2 (100%)

  - wrong: `ecc` (turned away, —)
  - wrong: `portfolio` (Search, grovers)
  - wrong: `tour` (Search, grovers)
  - wrong: `bridge` (Search, grovers)
  - wrong: `knapsack` (Search, grovers)
  - wrong: `movies` (turned away, —)

## Code to Quantum, AI reader

- Right problem type (and number, for factoring): **16 of 16 (100%)**
- Of those run, the quantum answer matched the classical one: 11 of 11 (100%)

  - not run: `mystery_factor` (N = 143 needs 24 qubits for exact simulation; this laptop-scale kernel runs Shor's algorithm for N ≤ 127 (21 qubits). Try 15, 21, 33, 35, 51, 55, 77, 85, 91 or )

## Code to Quantum, built-in reader

- Right problem type (and number, for factoring): **10 of 16 (62%)**
- Of those run, the quantum answer matched the classical one: 5 of 5 (100%)

  - not run: `knapsack` (Missing parameter 'values' for this problem type.)
  - wrong: `mystery_factor` (expected factoring, found factoring)
  - wrong: `maxcut` (expected maxcut, found unsupported)
  - wrong: `portfolio` (expected portfolio, found unsupported)
  - wrong: `sat` (expected boolean, found unsupported)
  - wrong: `js_search` (expected search, found unsupported)
  - wrong: `english_tsp` (expected tsp, found unsupported)


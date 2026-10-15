# QAIbridge AI evaluation

2026-10-13T12:53:43+00:00 · model claude-haiku-5-5 · 138 AI requests · $0.0242 · 82.8 s

## Describe a circuit

- Right circuit (the simulator gives the asked-for chances): **29 of 30 (97%)**
- Its own expected chances agreed with the simulator: 29 of 30 (97%)
- When the circuit was wrong, the check warned: 1 of 1
- Off-topic requests turned away: 2 of 2 (100%)

  - wrong: `w3` (off by 0.3333, got {'010': 0.3333, '011': 0.3333, '100': 0.3333})

## AI Advisor, AI reader

- Right category and a sound quantum algorithm: **20 of 20 (100%)**
- Right category: 20 of 20 (100%)
- Sound quantum algorithm: 20 of 20 (100%)
- Off-topic requests turned away: 2 of 2 (100%)


## AI Advisor, built-in keyword reader

- Right category and a sound quantum algorithm: **17 of 20 (85%)**
- Right category: 18 of 20 (90%)
- Sound quantum algorithm: 17 of 20 (85%)
- Off-topic requests turned away: 2 of 2 (100%)

  - wrong: `portfolio` (Search, grovers)
  - wrong: `tour` (Search, grovers)
  - wrong: `sat` (Search, amplitude_amp)

## AI Advisor, AI reader, 24 held-out problems

- Right category and a sound quantum algorithm: **22 of 24 (92%)**
- Right category: 22 of 24 (92%)
- Sound quantum algorithm: 23 of 24 (96%)
- Off-topic requests turned away: 0 of 0 (0%)

  - wrong: `h_any_solution` (Optimisation, qaoa)
  - wrong: `h_wifi` (Search, grovers)

## AI Advisor, built-in keyword reader, 24 held-out problems

- Right category and a sound quantum algorithm: **16 of 24 (67%)**
- Right category: 16 of 24 (67%)
- Sound quantum algorithm: 18 of 24 (75%)
- Off-topic requests turned away: 0 of 0 (0%)

  - wrong: `h_school_timetable` (Database, grovers)
  - wrong: `h_warehouse` (Search, amplitude_amp)
  - wrong: `h_ammonia` (turned away, —)
  - wrong: `h_spectrum` (Search, grovers)
  - wrong: `h_xray` (turned away, —)
  - wrong: `h_segments` (Search, grovers)
  - wrong: `h_frequencies` (Optimisation, qaoa)
  - wrong: `h_ssh_key` (Factoring, shors)

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


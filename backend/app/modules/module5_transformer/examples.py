"""
Module 5 – Classical → Quantum Logic Transformer
examples.py  –  Built-in classical programs, one per problem family the
Transformer can map (plus one it honestly cannot).
"""

EXAMPLES = [
    {
        "id": "search", "label": "Linear Search", "family": "Search → Grover",
        "code": (
            "# Classical: Linear Search — O(N)\n"
            "def linear_search(arr, target):\n"
            "    for i in range(len(arr)):\n"
            "        if arr[i] == target:\n"
            "            return i\n"
            "    return -1\n\n"
            "arr = [3, 14, 7, 42, 5, 9, 26, 11, 30, 8, 17, 2, 23, 19, 6, 12]\n"
            "result = linear_search(arr, 23)\n"
            "print(f'Found at index: {result}')\n"
        ),
    },
    {
        "id": "factoring", "label": "Number Factoring", "family": "Factoring → Shor",
        "code": (
            "# Classical: Trial Division — O(sqrt(N))\n"
            "def find_factors(n):\n"
            "    factors = []\n"
            "    for i in range(2, int(n ** 0.5) + 1):\n"
            "        if n % i == 0:\n"
            "            factors.append(i)\n"
            "            factors.append(n // i)\n"
            "    return sorted(set(factors))\n\n"
            "number = 91\n"
            "print(f'Factors of {number}: {find_factors(number)}')\n"
        ),
    },
    {
        "id": "tsp", "label": "Delivery Route (TSP)", "family": "Optimisation → QAOA",
        "code": (
            "# Classical: try every route — O(N!)\n"
            "from itertools import permutations\n"
            "from math import dist\n\n"
            "cities = [(\"Islamabad\", 33.68, 73.05), (\"Lahore\", 31.52, 74.36),\n"
            "          (\"Karachi\", 24.86, 67.01), (\"Peshawar\", 34.02, 71.52)]\n\n"
            "def route_length(order):\n"
            "    return sum(dist(cities[a][1:], cities[b][1:])\n"
            "               for a, b in zip(order, order[1:] + order[:1]))\n\n"
            "best = min(([0] + list(p) for p in permutations(range(1, len(cities)))), key=route_length)\n"
            "print('Shortest tour:', [cities[i][0] for i in best])\n"
        ),
    },
    {
        "id": "knapsack", "label": "Budget Knapsack", "family": "Optimisation → QAOA",
        "code": (
            "# Classical: brute-force knapsack — O(2^N)\n"
            "items = [(\"CPU\", 500, 9), (\"GPU\", 800, 10),\n"
            "         (\"RAM\", 150, 7), (\"SSD\", 200, 8)]   # (name, cost, value)\n"
            "budget = 1000\n\n"
            "best_value, best_combo = 0, []\n"
            "for mask in range(1, 2 ** len(items)):\n"
            "    combo = [items[j] for j in range(len(items)) if mask & (1 << j)]\n"
            "    cost = sum(x[1] for x in combo)\n"
            "    value = sum(x[2] for x in combo)\n"
            "    if cost <= budget and value > best_value:\n"
            "        best_value, best_combo = value, combo\n"
            "print('Best value:', best_value, [x[0] for x in best_combo])\n"
        ),
    },
    {
        "id": "maxcut", "label": "Network Max-Cut", "family": "Graph → QAOA",
        "code": (
            "# Classical: split a network into two teams, maximising cross-team links (cut)\n"
            "edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 0), (0, 2), (1, 4)]\n"
            "n = 5\n\n"
            "best_cut, best_split = 0, None\n"
            "for mask in range(2 ** n):\n"
            "    side = [(mask >> v) & 1 for v in range(n)]\n"
            "    cut = sum(1 for a, b in edges if side[a] != side[b])\n"
            "    if cut > best_cut:\n"
            "        best_cut, best_split = cut, side\n"
            "print('Max cut:', best_cut, best_split)\n"
        ),
    },
    {
        "id": "boolean", "label": "Access Rule (Boolean)", "family": "Logic → Oracle + Grover",
        "code": (
            "# Classical: a Boolean access-control rule\n"
            "def can_open_vault(manager, guard, alarm_on, night):\n"
            "    return (manager and guard) and not alarm_on or (manager and not night)\n\n"
            "# Which combinations of inputs open the vault?\n"
            "print(can_open_vault(True, True, False, True))\n"
        ),
    },
    {
        "id": "database", "label": "Employee Query", "family": "Database → Amplitude amp.",
        "code": (
            "# Classical: unindexed query — every row is read, O(N)\n"
            "employees = [\n"
            "    {\"name\": \"Ayesha\", \"dept\": \"Research\", \"age\": 34},\n"
            "    {\"name\": \"Bilal\", \"dept\": \"Finance\", \"age\": 51},\n"
            "    {\"name\": \"Hamza\", \"dept\": \"Research\", \"age\": 29},\n"
            "    {\"name\": \"Fatima\", \"dept\": \"Security\", \"age\": 45},\n"
            "    {\"name\": \"Usman\", \"dept\": \"HR\", \"age\": 38},\n"
            "    {\"name\": \"Zainab\", \"dept\": \"Engineering\", \"age\": 26},\n"
            "    {\"name\": \"Omar\", \"dept\": \"Research\", \"age\": 61},\n"
            "    {\"name\": \"Hira\", \"dept\": \"Marketing\", \"age\": 33},\n"
            "]\n"
            "senior = [e for e in employees if e[\"age\"] > 50]\n"
            "print(senior)\n"
        ),
    },
    {
        "id": "partition", "label": "Fair Split (Partition)", "family": "Optimisation → QAOA",
        "code": (
            "# Classical: split tasks into two equal-sum groups (partition problem)\n"
            "tasks = [8, 7, 6, 5, 4]\n\n"
            "best_diff, best_mask = None, 0\n"
            "for mask in range(2 ** len(tasks)):\n"
            "    a = sum(t for i, t in enumerate(tasks) if mask >> i & 1)\n"
            "    diff = abs(sum(tasks) - 2 * a)\n"
            "    if best_diff is None or diff < best_diff:\n"
            "        best_diff, best_mask = diff, mask\n"
            "print('Smallest imbalance:', best_diff)\n"
        ),
    },
    {
        "id": "portfolio", "label": "Stock Portfolio (finance)", "family": "Finance → QAOA",
        "code": (
            "# Classical: pick the best 3 of 6 PSX stocks (return vs risk) — tries every combination\n"
            "# (illustrative numbers)\n"
            "from itertools import combinations\n\n"
            "stocks = [\"ENGRO\", \"HBL\", \"LUCK\", \"OGDC\", \"PSO\", \"SYS\"]\n"
            "returns = [0.12, 0.09, 0.15, 0.08, 0.11, 0.18]      # expected annual return\n"
            "volatility = [0.20, 0.15, 0.28, 0.18, 0.22, 0.35]   # annual risk (standard deviation)\n"
            "k = 3                                               # number of stocks to hold\n"
            "risk_aversion = 0.5\n\n"
            "def score(choice):\n"
            "    ret = sum(returns[i] for i in choice) / k\n"
            "    risk = sum(volatility[i] ** 2 for i in choice) / k ** 2\n"
            "    return ret - risk_aversion * risk\n\n"
            "best = max(combinations(range(len(stocks)), k), key=score)\n"
            "print('Best portfolio:', [stocks[i] for i in best])\n"
        ),
    },
    {
        "id": "sorting", "label": "Bubble Sort (no speed-up)", "family": "Honest answer",
        "code": (
            "# Classical: Bubble Sort — O(N^2)\n"
            "def bubble_sort(arr):\n"
            "    n = len(arr)\n"
            "    for i in range(n):\n"
            "        for j in range(0, n - i - 1):\n"
            "            if arr[j] > arr[j + 1]:\n"
            "                arr[j], arr[j + 1] = arr[j + 1], arr[j]\n"
            "    return arr\n\n"
            "print(bubble_sort([64, 34, 25, 12, 22, 11, 90]))\n"
        ),
    },
]

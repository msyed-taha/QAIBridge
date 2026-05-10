"""Module 8 – Interactive Performance Dashboard."""
from .benchmarker import (
    benchmark_search, benchmark_factoring,
    benchmark_optimization, benchmark_database,
    run_full_benchmark_suite, BenchmarkReport,
)
from .metrics import speedup_factor, theoretical_speedup, build_chart_data
from .classical_baseline import (
    classical_linear_search, classical_trial_division,
    classical_tsp_greedy, classical_database_search,
)

__all__ = [
    "benchmark_search", "benchmark_factoring",
    "benchmark_optimization", "benchmark_database",
    "run_full_benchmark_suite", "BenchmarkReport",
    "speedup_factor", "theoretical_speedup",
]

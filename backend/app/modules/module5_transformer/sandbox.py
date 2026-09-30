"""
Module 5 – Classical → Quantum Logic Transformer
sandbox.py  –  Running the user's classical Python safely enough for a demo.

Layers of defence (SEC-1):
  1. Static check with `ast` BEFORE anything runs: only an allow-list of pure
     computation modules may be imported; file, process, network, reflection
     and dynamic-code builtins (open, exec, eval, __import__, getattr …) and
     every dunder attribute (__class__, __globals__ …) are rejected.
  2. A separate interpreter in isolated mode (`python -I -S`): no user site
     packages, no PYTHON* environment variables, an empty environment and a
     fresh temporary working directory that is deleted afterwards.
  3. OS resource limits where available (Linux / macOS): CPU seconds, memory,
     file size, and no child processes; plus a wall-clock timeout.
  4. Output is truncated so a runaway print loop cannot flood the server.

This is defence in depth for a teaching tool, not a hardened multi-tenant
sandbox — a public deployment should additionally run it inside a locked-down
container with networking disabled (see docker-compose.yml).
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
import tempfile
import threading
import time
from typing import Dict, List, Tuple

ALLOWED_MODULES = {
    "math", "cmath", "random", "itertools", "functools", "collections", "heapq", "bisect",
    "statistics", "fractions", "decimal", "string", "re", "time", "datetime", "typing",
    "dataclasses", "operator", "copy", "json", "numbers", "enum", "array",
}
FORBIDDEN_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "help", "exit", "quit", "memoryview", "__builtins__",
    "__loader__", "__spec__",
}
TIMEOUT_SECONDS = 10
CPU_SECONDS = 8
MEMORY_BYTES = 512 * 1024 * 1024
MAX_OUTPUT_CHARS = 20_000


def static_check(code: str) -> Tuple[bool, str]:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"Syntax error on line {e.lineno}: {e.msg}"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                root = a.name.split(".")[0]
                if root not in ALLOWED_MODULES:
                    return False, f"Import of '{a.name}' is not allowed (allowed: {', '.join(sorted(ALLOWED_MODULES))})."
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if node.level or root not in ALLOWED_MODULES:
                return False, f"Import from '{node.module}' is not allowed."
        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            return False, f"Use of '{node.id}' is not allowed in the sandbox."
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr.endswith("__"):
            return False, f"Access to '{node.attr}' is not allowed in the sandbox."
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and "__" in node.value \
                and any(w in node.value for w in ("__class__", "__subclasses__", "__globals__", "__builtins__", "__import__")):
            return False, "Suspicious dunder string detected."
    return True, ""


def _limit_resources() -> None:          # runs in the child just before exec (POSIX only)
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
        try:
            resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
        except (ValueError, OSError):
            pass                          # macOS does not support RLIMIT_AS
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
        except (ValueError, OSError, AttributeError):
            pass
    except Exception:
        pass


def _watch_memory(proc: subprocess.Popen, state: Dict[str, bool]) -> None:
    """Kill the child if its resident memory exceeds MEMORY_BYTES (macOS/Windows ignore RLIMIT_AS)."""
    try:
        import psutil
        child = psutil.Process(proc.pid)
        while proc.poll() is None:
            try:
                if child.memory_info().rss > MEMORY_BYTES:
                    state["memory_killed"] = True
                    proc.kill()
                    return
            except psutil.Error:
                return
            time.sleep(0.05)
    except Exception:
        return


def run_python(code: str) -> Dict[str, object]:
    ok, reason = static_check(code)
    if not ok:
        return {"output": "", "error": f"Security check: {reason}", "success": False, "time_ms": 0, "blocked": True}

    with tempfile.TemporaryDirectory(prefix="qaib-sandbox-") as workdir:
        cmd: List[str] = [sys.executable, "-I", "-S", "-c", code]
        env = {"PYTHONIOENCODING": "utf-8", "PATH": "/usr/bin:/bin"}
        kwargs = {}
        if os.name == "posix":
            kwargs["preexec_fn"] = _limit_resources
        start = time.perf_counter()
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
                                text=True, cwd=workdir, env=env, **kwargs)
        state = {"memory_killed": False}
        watcher = threading.Thread(target=_watch_memory, args=(proc, state), daemon=True)
        watcher.start()
        try:
            out, err = proc.communicate(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            return {"output": "", "error": f"Execution timed out after {TIMEOUT_SECONDS}s.", "success": False,
                    "time_ms": TIMEOUT_SECONDS * 1000, "blocked": False}
        elapsed = round((time.perf_counter() - start) * 1000)
        if len(out) > MAX_OUTPUT_CHARS:
            out = out[:MAX_OUTPUT_CHARS] + "\n… output truncated …"
        if state["memory_killed"]:
            err = (err + f"\nProcess stopped by the sandbox: memory use exceeded {MEMORY_BYTES // (1024 * 1024)} MB.").strip()
        elif proc.returncode < 0:
            err = (err + f"\nProcess stopped by the sandbox (signal {-proc.returncode}: "
                         "CPU, memory or process limit reached).").strip()
        return {"output": out, "error": err[-4000:], "success": proc.returncode == 0,
                "time_ms": elapsed, "blocked": False}

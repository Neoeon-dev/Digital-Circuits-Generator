"""Exact Quine-McCluskey minimization."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple


def _combine(a: str, b: str) -> Optional[str]:
    differences = 0
    result = []
    for x, y in zip(a, b):
        if x == y:
            result.append(x)
        elif x == "-" or y == "-":
            return None
        else:
            differences += 1
            result.append("-")
    return "".join(result) if differences == 1 else None


def _implicant_covers(pattern: str, minterm: int, n_vars: int) -> bool:
    bits = format(minterm, f"0{n_vars}b")
    return all(p == "-" or p == b for p, b in zip(pattern, bits))


def _prime_implicants(n_vars: int, minterms: Sequence[int]) -> List[str]:
    if not minterms:
        return []

    current = {format(m, f"0{n_vars}b") for m in sorted(set(minterms))}
    primes: set[str] = set()

    while current:
        groups: Dict[int, set[str]] = {}
        for pattern in current:
            groups.setdefault(pattern.count("1"), set()).add(pattern)

        used: set[str] = set()
        next_patterns: set[str] = set()
        keys = sorted(groups)

        for key in keys:
            for a in groups[key]:
                for b in groups.get(key + 1, ()):
                    combined = _combine(a, b)
                    if combined is not None:
                        used.add(a)
                        used.add(b)
                        next_patterns.add(combined)

        primes.update(current - used)
        if not next_patterns:
            break
        current = next_patterns

    return sorted(primes)


def _cover_cost(patterns: Sequence[str]) -> Tuple[int, int, Tuple[str, ...]]:
    return (
        len(patterns),
        sum(p.count("0") + p.count("1") for p in patterns),
        tuple(sorted(patterns)),
    )


def _exact_cover(
    minterms: Sequence[int],
    prime_implicants: Sequence[str],
    n_vars: int,
) -> List[str]:
    target = frozenset(minterms)
    if not target:
        return []

    coverage = {
        pi: frozenset(m for m in target if _implicant_covers(pi, m, n_vars))
        for pi in prime_implicants
    }
    chart: Dict[int, List[str]] = {m: [] for m in target}
    for pi, covered in coverage.items():
        for m in covered:
            chart[m].append(pi)

    chosen: set[str] = set()
    covered: set[int] = set()
    for m, options in chart.items():
        if len(options) == 1:
            chosen.add(options[0])

    for pi in chosen:
        covered.update(coverage[pi])

    remaining = target - frozenset(covered)
    if not remaining:
        return sorted(chosen, key=lambda p: (p.count("-"), p))

    best: Optional[List[str]] = None

    def search(uncovered: frozenset[int], selected: set[str]) -> None:
        nonlocal best
        if not uncovered:
            candidate = sorted(selected)
            if best is None or _cover_cost(candidate) < _cover_cost(best):
                best = candidate
            return

        if best is not None and len(selected) >= len(best):
            return

        m = min(
            uncovered,
            key=lambda x: sum(1 for pi in chart[x] if pi not in selected),
        )
        options = [pi for pi in chart[m] if pi not in selected]
        options.sort(
            key=lambda pi: (
                -(len(coverage[pi] & uncovered)),
                pi.count("-"),
                pi,
            )
        )

        for pi in options:
            new_uncovered = uncovered - coverage[pi]
            search(frozenset(new_uncovered), selected | {pi})

    search(frozenset(remaining), set(chosen))
    if best is None:
        raise RuntimeError("Failed to find a prime-implicant cover")
    return best


def quine_mccluskey(n_vars: int, minterms: Sequence[int]) -> List[str]:
    """Return an exact minimum SOP as implicant patterns."""
    mins = sorted(set(minterms))
    if not mins:
        return []
    if len(mins) == 2 ** n_vars:
        return ["-" * n_vars]

    primes = _prime_implicants(n_vars, mins)
    return _exact_cover(mins, primes, n_vars)

"""Small, rule-based natural-language -> boolean-expression converter.

This is a conservative fallback used during development and testing. It
extracts single-letter variables (A-Z) and tries to map common English
connectives to boolean operators. It is NOT an AI model and should be
replaced by a proper AI integration when available.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable


def _find_variables(text: str) -> Iterable[str]:
	# Find single uppercase letter variables (A, B, C, ...)
	return sorted(set(re.findall(r"\b([A-Z])\b", text)))


def convert_nl_to_expression(text: str) -> Dict[str, object]:
	text = (text or "").strip()
	if not text:
		return {"inputs": [], "outputs": ["F"], "expression": "", "explanation": ""}

	vars = list(_find_variables(text))

	# Heuristic: choose operator based on keywords.
	op = None
	if re.search(r"\band\b|\&|both|all of", text, flags=re.I):
		op = "&"
	elif re.search(r"\bor\b|\||either|any of", text, flags=re.I):
		op = "|"
	elif re.search(r"\bxor\b|\bexclusive\b", text, flags=re.I):
		op = "^"

	if op and len(vars) >= 2:
		expression = f" {op} ".join(vars)
	elif vars:
		expression = vars[0]
	else:
		# Fallback: attempt to extract something that looks like a boolean expr
		m = re.search(r"([A-Za-z0-9_\'\+\-\|&\^~() ]{1,200})", text)
		expression = m.group(1).strip() if m else ""

	explanation = f"Converted using simple rules from: {text}"

	return {
		"inputs": vars,
		"outputs": ["F"],
		"expression": expression,
		"explanation": explanation,
	}


__all__ = ["convert_nl_to_expression"]

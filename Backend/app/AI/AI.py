from __future__ import annotations

import os
from pathlib import Path

from google import genai
from google.genai import types
from pydantic import BaseModel


# ============================================================
# Response Schema
# ============================================================

class BooleanInterpretation(BaseModel):
    inputs: list[str]
    output: str
    expression: str
    explanation: str


# ============================================================
# Prompt Configuration
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
PROMPT_PATH = BASE_DIR / "boolean_interpreter.md"


def _load_system_prompt() -> str:
    """
    Load the Boolean-logic interpretation prompt from the
    Markdown file next to this module.
    """
    if not PROMPT_PATH.exists():
        raise RuntimeError(
            f"Boolean interpreter prompt not found: {PROMPT_PATH}"
        )

    prompt = PROMPT_PATH.read_text(encoding="utf-8").strip()

    if not prompt:
        raise RuntimeError(
            f"Boolean interpreter prompt is empty: {PROMPT_PATH}"
        )

    return prompt


SYSTEM_PROMPT = _load_system_prompt()


# ============================================================
# Gemini Client
# ============================================================

def _get_client() -> genai.Client:
    """
    Create a Gemini client using GEMINI_API_KEY.
    """
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured"
        )

    return genai.Client(api_key=api_key)


# ============================================================
# Boolean Interpretation
# ============================================================

def interpret(text: str) -> dict:
    """
    Convert a natural-language digital logic problem into
    a structured Boolean interpretation.

    This function is intentionally kept API-agnostic so that
    main.py can simply call:

        interpretation = interpret(problem)
    """

    if not isinstance(text, str):
        raise TypeError("text must be a string")

    text = text.strip()

    if not text:
        raise ValueError(
            "Problem statement cannot be empty"
        )

    client = _get_client()

    user_prompt = f"""
Interpret the following digital logic problem.

<problem>
{text}
</problem>

Return the Boolean interpretation according to the
system instructions.

Important:
- Preserve the exact meaning of the problem.
- Do not invent missing variables or conditions.
- Do not simplify the resulting expression unless the
  problem explicitly asks for simplification.
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=BooleanInterpretation,
                temperature=0.0,
            ),
        )

    except Exception as exc:
        raise RuntimeError(
            f"Gemini request failed: {exc}"
        ) from exc

    if not response.text:
        raise RuntimeError(
            "Gemini returned an empty response"
        )

    try:
        result = BooleanInterpretation.model_validate_json(
            response.text
        )

    except Exception as exc:
        raise RuntimeError(
            "Gemini returned an invalid structured response"
        ) from exc

    return {
        "inputs": result.inputs,
        "outputs": [result.output],
        "expression": result.expression,
        "explanation": result.explanation,
        "source": "gemini",
    }
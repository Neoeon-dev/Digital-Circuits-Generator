from __future__ import annotations

import os

from google import genai
from google.genai import types
from pydantic import BaseModel


class BooleanInterpretation(BaseModel):
    inputs: list[str]
    output: str
    expression: str
    explanation: str


SYSTEM_PROMPT = """
You convert digital logic problem statements into Boolean expressions.

Return ONLY the requested structured fields.

Rules:
- Use uppercase letters for Boolean variables.
- Use "" for AND.(like AB)
- Use + for OR.
- Use ' for NOT.
- Use parentheses where necessary.
- Do not simplify the expression.
- Do not generate a truth table.
- Do not generate a circuit.
- Do not invent variables.
- The output variable should normally be F.
"""


def interpret(text: str) -> dict:
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    text = text.strip()

    if not text:
        raise ValueError("Problem statement cannot be empty")

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=BooleanInterpretation,
        ),
    )

    result = BooleanInterpretation.model_validate_json(response.text)

    return {
        "inputs": result.inputs,
        "outputs": [result.output],
        "expression": result.expression,
        "explanation": result.explanation,
        "source": "gemini",
    }
"""Main public generation endpoint.

The endpoint is intentionally unaware of Gemini internals beyond calling the
private interpreter. Gemini returns a Boolean expression; the deterministic
Logic Engine does the rest.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.AI.AI import interpret
from app.Engine.logic.main import generate_circuit


router = APIRouter(prefix="/api", tags=["Generation"])


class GenerateRequest(BaseModel):
    problem: str = Field(
        min_length=1,
        description="Natural-language digital logic problem statement.",
    )
    gates: Literal["and_or", "nand", "nor"] = Field(
        default="and_or",
        description="Gate implementation to use.",
    )
    fan_in: int = Field(
        default=2,
        ge=2,
        description="Maximum number of inputs allowed per gate.",
    )


@router.post("/generate")
def generate(request: GenerateRequest):
    """Convert a problem statement into Boolean analysis and a circuit."""

    try:
        interpretation = interpret(request.problem)
        expression = interpretation["expression"]

        circuit_id = uuid4().hex
        output_path = Path("app/generated") / f"{circuit_id}.png"

        logic_result = generate_circuit(
            expression=expression,
            gates=request.gates,
            fan_in=request.fan_in,
            output_file=str(output_path),
        )

        # The engine knows the local artifact path. The API exposes only a
        # URL that the frontend can request from FastAPI.
        logic_result.circuit.image = f"/generated/{circuit_id}.png"

        return {
            "problem": request.problem,
            "ai": {
                "inputs": interpretation.get("inputs", []),
                "outputs": interpretation.get("outputs", ["F"]),
                "expression": expression,
                "explanation": interpretation.get("explanation", ""),
            },
            "logic": logic_result,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
"""FastAPI endpoints for Boolean Logic generation.

The API layer:
    1. Receives a user input representation.
    2. Uses Gemini only for natural-language statements.
    3. Delegates deterministic logic generation to
       app.Engine.logic.main.
    4. Returns JSON to the frontend.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.AI.AI import interpret

from ..Engine.logic.main import (
    generate_circuit,
    generate_from_truth_table as engine_generate_from_truth_table,
    generate_from_minterms as engine_generate_from_minterms,
    generate_from_maxterms as engine_generate_from_maxterms,
    generate_from_dummy_variables as engine_generate_from_dummy_variables,
)


router = APIRouter(
    prefix="/api/logic",
    tags=["Logic Generation"],
)


# ============================================================
# TYPES
# ============================================================

GateMode = Literal[
    "AND, OR & NOT",
    "NAND only",
    "NOR only",
]

EngineGate = Literal[
    "and_or",
    "nand",
    "nor",
]


def normalize_gate_mode(
    mode: GateMode,
) -> EngineGate:
    """Convert frontend gate names to engine gate names."""

    mapping: dict[GateMode, EngineGate] = {
        "AND, OR & NOT": "and_or",
        "NAND only": "nand",
        "NOR only": "nor",
    }

    return mapping[mode]


# ============================================================
# COMMON OPTIONS
# ============================================================

class GateOptions(BaseModel):
    gate_mode: GateMode = Field(
        default="AND, OR & NOT",
        description="Gate family selected by the frontend.",
    )

    fan_in: int = Field(
        default=2,
        ge=2,
        description="Maximum number of inputs per gate.",
    )


# ============================================================
# STATEMENT
# ============================================================

class StatementRequest(GateOptions):
    problem: str = Field(
        min_length=1,
        description="Natural-language digital logic problem.",
    )


# ============================================================
# BOOLEAN EXPRESSION
# ============================================================

class ExpressionRequest(GateOptions):
    expression: str = Field(
        min_length=1,
        description="Boolean expression.",
    )

    variable_order: list[str] | None = Field(
        default=None,
        description="Optional explicit variable ordering.",
    )


# ============================================================
# TRUTH TABLE
# ============================================================

class TruthTableRequest(GateOptions):
    truth_table: list[dict[str, int]] = Field(
        min_length=1,
        description="Truth table rows.",
    )

    output: str = Field(
        default="F",
        description="Output column name.",
    )


# ============================================================
# MINTERMS
# ============================================================

class MintermRequest(GateOptions):
    minterms: list[int] = Field(
        default_factory=list,
        description="Minterm indices.",
    )

    variables: list[str] = Field(
        min_length=1,
        description="Boolean variables.",
    )


# ============================================================
# MAXTERMS
# ============================================================

class MaxtermRequest(GateOptions):
    maxterms: list[int] = Field(
        default_factory=list,
        description="Maxterm indices.",
    )

    variables: list[str] = Field(
        min_length=1,
        description="Boolean variables.",
    )


# ============================================================
# DUMMY VARIABLES
# ============================================================

class DummyVariableRequest(GateOptions):
    variables: list[str] = Field(
        min_length=1,
        description="Dummy Boolean variables.",
    )

    minterms: list[int] | None = Field(
        default=None,
        description="Optional minterms defining the dummy function.",
    )


# ============================================================
# CIRCUIT ARTIFACT HELPERS
# ============================================================

def create_circuit_output() -> tuple[str, str]:
    """
    Create a unique filesystem path for a generated circuit image.

    Returns:
        (circuit_id, local filesystem path)
    """

    circuit_id = uuid4().hex

    output_dir = Path("app/generated")
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path = (
        output_dir / f"{circuit_id}.png"
    )

    return (
        circuit_id,
        str(output_path),
    )


def attach_circuit_image_url(
    result: dict,
    circuit_id: str,
) -> dict:
    """
    Replace the internal image path with the public API URL.
    """

    circuit = result.get("circuit")

    if isinstance(circuit, dict):
        circuit["image"] = (
            f"/generated/{circuit_id}.png"
        )

    return result


# ============================================================
# COMMON ERROR HANDLING
# ============================================================

def handle_generation_error(
    exc: Exception,
) -> None:
    """Convert engine errors into FastAPI HTTP errors."""

    if isinstance(exc, ValueError):
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    if isinstance(exc, RuntimeError):
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    raise HTTPException(
        status_code=500,
        detail="An unexpected error occurred.",
    ) from exc


# ============================================================
# 1. NATURAL-LANGUAGE STATEMENT
# ============================================================

@router.post("/generate")
def generate_from_statement(
    request: StatementRequest,
):
    """
    Generate logic from a natural-language statement.

    Flow:

        statement
            ↓
        Gemini
            ↓
        Boolean expression
            ↓
        generate_circuit()
            ↓
        complete JSON
    """

    try:
        interpretation = interpret(
            request.problem
        )

        expression = interpretation.get(
            "expression"
        )

        if not expression:
            raise ValueError(
                "AI did not return a Boolean expression."
            )

        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = generate_circuit(
            expression=expression,
            gates=normalize_gate_mode(
                request.gate_mode
            ),
            fan_in=request.fan_in,
            output_file=output_path,
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "problem": request.problem,

            "ai": {
                "inputs": interpretation.get(
                    "inputs",
                    [],
                ),
                "outputs": interpretation.get(
                    "outputs",
                    ["F"],
                ),
                "expression": expression,
                "explanation": interpretation.get(
                    "explanation",
                    "",
                ),
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)


# ============================================================
# 2. BOOLEAN EXPRESSION
# ============================================================

@router.post("/expression")
def generate_from_expression(
    request: ExpressionRequest,
):
    """
    Generate directly from a Boolean expression.
    """

    try:
        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = generate_circuit(
            expression=request.expression,
            gates=normalize_gate_mode(
                request.gate_mode
            ),
            fan_in=request.fan_in,
            variable_order=request.variable_order,
            output_file=output_path,
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "input_type": "Boolean expression",

            "input": {
                "expression":
                    request.expression,
                "variables":
                    request.variable_order,
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)


# ============================================================
# 3. TRUTH TABLE
# ============================================================

@router.post("/truth-table")
def generate_from_truth_table_api(
    request: TruthTableRequest,
):
    """
    Generate from a truth table.

    Flow:

        truth table
            ↓
        Boolean expression
            ↓
        generate_circuit()
    """

    try:
        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = (
            engine_generate_from_truth_table(
                truth_table=request.truth_table,
                output=request.output,
                gates=normalize_gate_mode(
                    request.gate_mode
                ),
                fan_in=request.fan_in,
                output_file=output_path,
            )
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "input_type": "Truth table",

            "input": {
                "truth_table":
                    request.truth_table,
                "output":
                    request.output,
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)


# ============================================================
# 4. MINTERMS
# ============================================================

@router.post("/minterms")
def generate_from_minterms_api(
    request: MintermRequest,
):
    """
    Generate from minterms.

    Flow:

        minterms
            ↓
        Boolean expression
            ↓
        generate_circuit()
    """

    try:
        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = (
            engine_generate_from_minterms(
                minterms=request.minterms,
                variables=request.variables,
                gates=normalize_gate_mode(
                    request.gate_mode
                ),
                fan_in=request.fan_in,
                output_file=output_path,
            )
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "input_type": "Minterms",

            "input": {
                "minterms":
                    request.minterms,
                "variables":
                    request.variables,
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)


# ============================================================
# 5. MAXTERMS
# ============================================================

@router.post("/maxterms")
def generate_from_maxterms_api(
    request: MaxtermRequest,
):
    """
    Generate from maxterms.

    Flow:

        maxterms
            ↓
        Boolean expression
            ↓
        generate_circuit()
    """

    try:
        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = (
            engine_generate_from_maxterms(
                maxterms=request.maxterms,
                variables=request.variables,
                gates=normalize_gate_mode(
                    request.gate_mode
                ),
                fan_in=request.fan_in,
                output_file=output_path,
            )
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "input_type": "Maxterms",

            "input": {
                "maxterms":
                    request.maxterms,
                "variables":
                    request.variables,
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)


# ============================================================
# 6. DUMMY VARIABLES
# ============================================================

@router.post("/dummy")
def generate_from_dummy_api(
    request: DummyVariableRequest,
):
    """
    Generate from dummy variables.
    """

    try:
        circuit_id, output_path = (
            create_circuit_output()
        )

        logic_result = (
            engine_generate_from_dummy_variables(
                variables=request.variables,
                minterms=request.minterms,
                gates=normalize_gate_mode(
                    request.gate_mode
                ),
                fan_in=request.fan_in,
                output_file=output_path,
            )
        )

        logic_result = attach_circuit_image_url(
            logic_result,
            circuit_id,
        )

        return {
            "input_type": "Dummy",

            "input": {
                "variables":
                    request.variables,
                "minterms":
                    request.minterms,
            },

            "logic": logic_result,
        }

    except (ValueError, RuntimeError) as exc:
        handle_generation_error(exc)
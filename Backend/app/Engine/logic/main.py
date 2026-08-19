"""Public access point for the Boolean Logic Engine."""

from __future__ import annotations

from itertools import product
from typing import Any

from .engine import run
from .outputs.standard_circuits import (
    half_adder,
    half_subtractor,
    full_adder,
    full_subtractor,
    multiplier_3bit,
)


# ============================================================
# INTERNAL
# ============================================================

def _to_json(result: Any) -> dict:
    """Convert LogicResult into a JSON-serializable dictionary."""

    if hasattr(result, "model_dump"):
        return result.model_dump()

    if hasattr(result, "dict"):
        return result.dict()

    if isinstance(result, dict):
        return result

    if hasattr(result, "__dict__"):
        return result.__dict__

    raise TypeError(
        f"Cannot convert {type(result).__name__} to JSON"
    )


# ============================================================
# MAIN CIRCUIT GENERATOR
# ============================================================

def generate_circuit(
    expression: str,
    gates: str = "and_or",
    fan_in: int = 2,
    variable_order: list[str] | None = None,
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    """
    Main Boolean logic generation function.

    Everything eventually gets converted into a Boolean
    expression and comes through this function.
    """

    result = run(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variable_order,
        outfile=output_file,
        json_outfile=json_file,
    )

    return _to_json(result)


# ============================================================
# TRUTH TABLE -> BOOLEAN EXPRESSION
# ============================================================

def truth_table_to_expression(
    truth_table: list[dict[str, int]],
    output: str = "F",
) -> str:
    """
    Convert a truth table into canonical SOP.

    Example:

    [
        {"A": 0, "B": 0, "F": 0},
        {"A": 0, "B": 1, "F": 1},
        {"A": 1, "B": 0, "F": 1},
        {"A": 1, "B": 1, "F": 0},
    ]

    -> A'B + AB'
    """

    if not truth_table:
        raise ValueError(
            "Truth table cannot be empty"
        )

    # Every column except output is an input variable.
    variables = [
        key
        for key in truth_table[0].keys()
        if key != output
    ]

    minterm_expressions: list[str] = []

    for row in truth_table:
        if int(row[output]) != 1:
            continue

        terms: list[str] = []

        for variable in variables:
            value = int(row[variable])

            if value == 1:
                terms.append(variable)
            else:
                terms.append(f"{variable}'")

        minterm_expressions.append(
            "".join(terms)
        )

    # No rows evaluate to 1.
    if not minterm_expressions:
        return "0"

    return " + ".join(
        minterm_expressions
    )


def generate_from_truth_table(
    truth_table: list[dict[str, int]],
    gates: str = "and_or",
    fan_in: int = 2,
    output: str = "F",
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    """
    Convert truth table -> Boolean expression ->
    generate_circuit().
    """

    expression = truth_table_to_expression(
        truth_table,
        output=output,
    )

    variables = [
        key
        for key in truth_table[0].keys()
        if key != output
    ]

    return generate_circuit(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variables,
        output_file=output_file,
        json_file=json_file,
    )


# ============================================================
# MINTERMS -> BOOLEAN EXPRESSION
# ============================================================

def minterms_to_expression(
    minterms: list[int],
    variables: list[str],
) -> str:
    """
    Convert minterm indices into canonical SOP.

    Example:

        minterms = [1, 2]
        variables = ["A", "B"]

    -> A'B + AB'
    """

    if not variables:
        raise ValueError(
            "At least one variable is required"
        )

    variable_count = len(variables)

    max_index = (1 << variable_count) - 1

    for minterm in minterms:
        if minterm < 0 or minterm > max_index:
            raise ValueError(
                f"Minterm {minterm} is invalid for "
                f"{variable_count} variables"
            )

    terms: list[str] = []

    for minterm in minterms:
        bits = format(
            minterm,
            f"0{variable_count}b",
        )

        term = ""

        for variable, bit in zip(
            variables,
            bits,
        ):
            term += (
                variable
                if bit == "1"
                else f"{variable}'"
            )

        terms.append(term)

    if not terms:
        return "0"

    return " + ".join(terms)


def generate_from_minterms(
    minterms: list[int],
    variables: list[str],
    gates: str = "and_or",
    fan_in: int = 2,
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    """
    Minterms -> Boolean expression ->
    generate_circuit().
    """

    expression = minterms_to_expression(
        minterms,
        variables,
    )

    return generate_circuit(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variables,
        output_file=output_file,
        json_file=json_file,
    )


# ============================================================
# MAXTERMS -> BOOLEAN EXPRESSION
# ============================================================

def maxterms_to_expression(
    maxterms: list[int],
    variables: list[str],
) -> str:
    """
    Convert maxterm indices into canonical POS.

    Example:

        maxterms = [0, 3]
        variables = ["A", "B"]

    -> (A + B)(A' + B')
    """

    if not variables:
        raise ValueError(
            "At least one variable is required"
        )

    variable_count = len(variables)

    max_index = (1 << variable_count) - 1

    for maxterm in maxterms:
        if maxterm < 0 or maxterm > max_index:
            raise ValueError(
                f"Maxterm {maxterm} is invalid for "
                f"{variable_count} variables"
            )

    clauses: list[str] = []

    for maxterm in maxterms:
        bits = format(
            maxterm,
            f"0{variable_count}b",
        )

        literals: list[str] = []

        for variable, bit in zip(
            variables,
            bits,
        ):
            # For POS:
            #
            # bit = 0 -> variable
            # bit = 1 -> variable'
            #
            literals.append(
                variable
                if bit == "0"
                else f"{variable}'"
            )

        clauses.append(
            "(" + " + ".join(literals) + ")"
        )

    if not clauses:
        return "1"

    return "".join(clauses)


def generate_from_maxterms(
    maxterms: list[int],
    variables: list[str],
    gates: str = "and_or",
    fan_in: int = 2,
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    """
    Maxterms -> Boolean expression ->
    generate_circuit().
    """

    expression = maxterms_to_expression(
        maxterms,
        variables,
    )

    return generate_circuit(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variables,
        output_file=output_file,
        json_file=json_file,
    )


# ============================================================
# DUMMY VARIABLES
# ============================================================

def dummy_variables_to_expression(
    variables: list[str],
    minterms: list[int] | None = None,
) -> str:
    """
    Create a Boolean expression using dummy variables.

    The variables themselves are not a complete Boolean
    function, so minterms define the function.

    Example:

        variables = ["A", "B"]
        minterms = [1, 2]

        -> A'B + AB'
    """

    if not variables:
        raise ValueError(
            "At least one dummy variable is required"
        )

    if minterms is None:
        # Default deterministic dummy function:
        # XOR-style function for the first two variables.
        if len(variables) == 2:
            a, b = variables
            return (
                f"{a}'{b} + {a}{b}'"
            )

        # For larger numbers, use the first variable.
        return variables[0]

    return minterms_to_expression(
        minterms,
        variables,
    )


def generate_from_dummy_variables(
    variables: list[str],
    minterms: list[int] | None = None,
    gates: str = "and_or",
    fan_in: int = 2,
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    """
    Dummy variables -> Boolean expression ->
    generate_circuit().
    """

    expression = dummy_variables_to_expression(
        variables,
        minterms,
    )

    return generate_circuit(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variables,
        output_file=output_file,
        json_file=json_file,
    )

def generate_expression(
    expression: str,
    gates: str = "and_or",
    fan_in: int = 2,
    variable_order: list[str] | None = None,
    output_file: str | None = None,
    json_file: str | None = None,
) -> dict:
    return generate_circuit(
        expression=expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variable_order,
        output_file=output_file,
        json_file=json_file,
    )


# ============================================================
# STANDARD CIRCUITS
# ============================================================

def generate_half_adder() -> dict:
    return _to_json(half_adder())


def generate_half_subtractor() -> dict:
    return _to_json(half_subtractor())


def generate_full_adder() -> dict:
    return _to_json(full_adder())


def generate_full_subtractor() -> dict:
    return _to_json(full_subtractor())


def generate_3bit_multiplier() -> dict:
    return _to_json(multiplier_3bit())
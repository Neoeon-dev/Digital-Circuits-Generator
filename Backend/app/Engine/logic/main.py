"""Public access point for the Boolean Logic Engine."""

from .engine import run
from .outputs.standard_circuits import (
    half_adder,
    half_subtractor,
    full_adder,
    full_subtractor,
    multiplier_3bit,
)


def generate_circuit(
    expression: str,
    gates: str = "and_or",
    fan_in: int = 2,
    variable_order: list[str] | None = None,
    output_file: str | None = None,
    json_file: str | None = None,
):
    """Generate a circuit from a Boolean expression."""

    return run(
        expression,
        gates=gates,
        fan_in=fan_in,
        variable_order=variable_order,
        outfile=output_file,
        json_outfile=json_file,
    )


def generate_half_adder():
    """Generate the half-adder truth table, analysis and circuit."""
    return half_adder()


def generate_half_subtractor():
    """Generate the half-subtractor truth table, analysis and circuit."""
    return half_subtractor()


def generate_full_adder():
    """Generate the full-adder truth table, analysis and circuit."""
    return full_adder()


def generate_full_subtractor():
    """Generate the full-subtractor truth table, analysis and circuit."""
    return full_subtractor()


def generate_3bit_multiplier():
    """Generate the 3-bit multiplier truth table, analysis and circuit."""
    return multiplier_3bit()
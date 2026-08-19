from fastapi import APIRouter

from app.Engine.logic.main import (
    generate_half_adder,
    generate_half_subtractor,
    generate_full_adder,
    generate_full_subtractor,
    generate_3bit_multiplier,
)

router = APIRouter(prefix="/api/circuits", tags=["Circuits"])


@router.get("/half-adder")
def get_half_adder():
    return generate_half_adder()


@router.get("/full-adder")
def get_full_adder():
    return generate_full_adder()


@router.get("/half-subtractor")
def get_half_subtractor():
    return generate_half_subtractor()


@router.get("/full-subtractor")
def get_full_subtractor():
    return generate_full_subtractor()


@router.get("/multiplier")
def get_multiplier():
    return generate_3bit_multiplier()
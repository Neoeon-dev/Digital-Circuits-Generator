"""FastAPI application entry point."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.circuits import router as circuits_router
from app.api.generate import router as generate_router


# ============================================================
# GENERATED FILES
# ============================================================

GENERATED_DIR = Path("app/generated")
GENERATED_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Digital Logic AI",
    version="0.1.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://digital-circuits-generator-4.onrender.com",
        "https://digital-circuits-generator.vercel.app/logic-solver"

        # Add your deployed Next.js frontend here later.
        # Example:
        # "https://digital-circuits-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# STATIC CIRCUIT IMAGES
# ============================================================

app.mount(
    "/generated",
    StaticFiles(
        directory=str(GENERATED_DIR)
    ),
    name="generated",
)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(
    generate_router
)

app.include_router(
    circuits_router
)


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():
    return {
        "message":
            "Digital Logic AI backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }
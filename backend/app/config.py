"""Validated environment settings for Aether Route."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_DEFAULT = ROOT / "data" / "aether.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_DEFAULT}")
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() in {"1", "true", "yes"}
SECRET_KEY = os.getenv("SECRET_KEY", "")
CORS_ORIGINS = [v.strip() for v in os.getenv("CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",") if v.strip()]
if not DEMO_MODE and len(SECRET_KEY) < 32:
    raise RuntimeError("Production requires SECRET_KEY with at least 32 characters")
if not SECRET_KEY:
    SECRET_KEY = "demo-only-not-for-production-change-me"  # Only accepted in demo mode.

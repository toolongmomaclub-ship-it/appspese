"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "spese")]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "expenses": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("mese", ASCENDING), ("data", DESCENDING)], name="mese_data"),
        IndexModel([("categoria", ASCENDING), ("mese", ASCENDING)], name="categoria_mese"),
        IndexModel([("tag_persona", ASCENDING)], name="tag_persona"),
        IndexModel([("data", DESCENDING)], name="data_desc"),
    ],
    "monthly_km": [IndexModel([("mese", ASCENDING)], name="mese", unique=True)],
    "fuel_adjustments": [IndexModel([("mese", ASCENDING)], name="mese", unique=True)],
    "keyword_rules": [IndexModel([("parola", ASCENDING)], name="parola", unique=True)],
    "subscriptions": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "month_overrides": [IndexModel([("mese", ASCENDING)], name="mese", unique=True)],
    "categories": [
        IndexModel([("key", ASCENDING)], name="key", unique=True),
        IndexModel([("nome", ASCENDING)], name="nome", unique=True),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)

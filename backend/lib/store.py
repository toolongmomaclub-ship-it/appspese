"""Helper condivisi fra i router."""

from lib.db import db


async def learned_rules() -> dict[str, str]:
    docs = await db.keyword_rules.find().to_list(2000)
    return {d["parola"]: d["categoria"] for d in docs}


async def km_map() -> dict[str, dict]:
    docs = await db.monthly_km.find().to_list(1000)
    return {d["mese"]: d for d in docs}


async def override_map() -> dict[str, float]:
    docs = await db.month_overrides.find().to_list(2000)
    return {
        d["mese"]: float(d["totale_manuale"])
        for d in docs
        if d.get("totale_manuale") is not None
    }


async def fuel_aid(mese: str) -> float:
    doc = await db.fuel_adjustments.find_one({"mese": mese})
    return float(doc["aiuto_esterno"]) if doc else 0.0


def km_fatti(doc: dict | None) -> int | None:
    if not doc:
        return None
    ki, kf = doc.get("km_iniziali"), doc.get("km_finali")
    if ki is None or kf is None:
        return None
    return int(kf) - int(ki)

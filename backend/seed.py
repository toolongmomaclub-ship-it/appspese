"""Seed idempotente: importa backend/data/spese_2026.txt se il DB è vuoto."""

import asyncio
from pathlib import Path

from lib.categorize import categorizza, rileva_persona
from lib.db import db, ensure_indexes
from lib.parser import parse_testo
from models.schemas import Expense

DATA = Path(__file__).parent / "data" / "spese_2026.txt"


async def main() -> None:
    await ensure_indexes()
    testo = DATA.read_text(encoding="utf-8")
    parsed = parse_testo(testo, 2026)
    totale = 0
    for b in parsed["mesi"]:
        await db.expenses.delete_many({"mese": b["mese"]})
        docs = [
            Expense(
                data=r["data"],
                mese=b["mese"],
                importo=r["importo"],
                motivo=r["motivo"],
                categoria=categorizza(r["motivo"]),
                tag_persona=rileva_persona(r["motivo"]),
                note_extra=r["note_extra"],
                data_stimata=True,
            ).model_dump()
            for r in b["righe"]
        ]
        if docs:
            await db.expenses.insert_many(docs)
            totale += len(docs)
        km = {k: v for k, v in
              {"km_iniziali": b["km_iniziali"], "km_finali": b["km_finali"]}.items()
              if v is not None}
        if km:
            await db.monthly_km.update_one(
                {"mese": b["mese"]}, {"$set": {"mese": b["mese"], **km}}, upsert=True
            )
        if b["aiuto_esterno"]:
            await db.fuel_adjustments.update_one(
                {"mese": b["mese"]},
                {"$set": {"mese": b["mese"], "aiuto_esterno": b["aiuto_esterno"]}},
                upsert=True,
            )
        print(f"{b['nome']}: {len(docs)} spese, calcolato {b['totale_calcolato']}€, "
              f"dichiarato {b['totale_dichiarato']}€")

    await db.subscriptions.update_one(
        {"id": "fissi"},
        {"$set": {"id": "fissi", "voci": [
            {"nome": "chat", "importo": 23.0},
            {"nome": "icloud", "importo": 10.0},
            {"nome": "amazon", "importo": 5.0},
            {"nome": "google", "importo": 3.0},
        ]}},
        upsert=True,
    )
    print(f"Totale inserite: {totale}")
    for w in parsed["warnings"]:
        print("WARN:", w)


if __name__ == "__main__":
    asyncio.run(main())

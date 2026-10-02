"""One-off: riassegna a 'Eventi & Vacanze' le spese esistenti con termini di viaggio."""

import asyncio

from lib.categorize import _tokens
from lib.db import db

TRAVEL = {"roma", "praga", "hotel", "albergo", "ostello", "airbnb",
          "volo", "viaggio", "gita", "vacanza", "vacanze"}
TARGET = "Eventi & Vacanze"


async def main() -> None:
    docs = await db.expenses.find({"categoria": {"$ne": TARGET}}).to_list(50000)
    aggiornate = 0
    for d in docs:
        toks = set(_tokens(d.get("motivo", "")))
        if toks & TRAVEL:
            await db.expenses.update_one(
                {"id": d["id"]}, {"$set": {"categoria": TARGET}}
            )
            aggiornate += 1
            print(f"  {d['data']} · {d['motivo']} · {d['categoria']} -> {TARGET}")
    print(f"Totale riassegnate: {aggiornate}")


if __name__ == "__main__":
    asyncio.run(main())

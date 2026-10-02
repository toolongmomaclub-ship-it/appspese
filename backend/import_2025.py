"""Import dedicato dei dati storici 2025 (formato a settimane).

Regole:
- ignora intestazioni settimana/weekend e righe di somma/calcolo (con '-->' o aritmetiche);
- ignora le righe 'tot:' per-settimana (non verifica incrociata: dati parziali);
- righe con motivo vuoto (es. '880€' totale mese) NON diventano spese;
- 'Praga 500€' e 'ROMA 300€' importate come spese (categoria Eventi & Vacanze);
- totale mensile dichiarato impostato come TOTALE MANUALE del mese (month_overrides);
- Settembre resta a 800€.
Idempotente: azzera e reinserisce solo i mesi 2025.
"""

import asyncio
import calendar
import re
from pathlib import Path

from lib.categorize import categorizza, rileva_persona
from lib.db import db, ensure_indexes
from models.schemas import Expense

TXT = Path(__file__).parent / "data" / "spese_2025.txt"

MESI = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}

DECLARED = {
    1: 717.7, 2: 724.0, 3: 1023.3, 4: 845.5, 5: 880.0, 6: 622.0,
    7: 981.0, 8: 230.0, 9: 800.0, 10: 764.70, 11: 915.90, 12: 844.36,
}

ROW = re.compile(r"^\+?\s*(\d+(?:[.,]\d{1,2})?)\s*€?\s*(.*)$")
WORD_FIRST = re.compile(r"^([A-Za-zÀ-ù][^\d]*?)\s+(\d+(?:[.,]\d{1,2})?)\s*€?$")
ARITH = re.compile(r"^[\d\s+.,€-]+$")
BIGNUM = re.compile(r"(\d{4,})")


def is_noise(line: str) -> bool:
    low = line.lower()
    if "-->" in line:
        return True
    if low.startswith(("settimana", "weekend", "weeckend", "week")):
        return True
    if low.startswith("tot"):
        return True
    if low.startswith("abbonamenti attivi"):
        return True
    if ARITH.match(line) and "+" in line:
        return True
    return False


async def main() -> None:
    await ensure_indexes()
    text = TXT.read_text(encoding="utf-8")

    blocks: dict[int, list[tuple[float, str]]] = {}
    km: dict[int, dict[str, int]] = {}
    warnings: list[str] = []
    cur: int | None = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower()

        key = low.rstrip(" :.-–—")
        if key in MESI:
            cur = MESI[key]
            blocks.setdefault(cur, [])
            continue

        if low.startswith("km"):
            mn = BIGNUM.search(line)
            if mn and cur:
                km.setdefault(cur, {})["ini"] = int(mn.group(1))
            continue
        if low.startswith("finali"):
            mn = BIGNUM.search(line)
            if mn and cur:
                km.setdefault(cur, {})["fin"] = int(mn.group(1))
            continue

        if is_noise(line) or cur is None:
            continue

        amount = motivo = None
        m = ROW.match(line)
        if m:
            amount, motivo = m.group(1), m.group(2).lstrip("€ ").strip()
        else:
            mw = WORD_FIRST.match(line)
            if mw:
                motivo, amount = mw.group(1).strip(), mw.group(2)

        if amount is None:
            warnings.append(line)
            continue
        if not motivo:  # righe di solo importo = totale mese, non spesa
            continue
        blocks[cur].append((round(float(amount.replace(",", ".")), 2), motivo))

    totale_righe = 0
    for mm in sorted(blocks):
        mese = f"2025-{mm:02d}"
        rows = blocks[mm]
        await db.expenses.delete_many({"mese": mese})
        gg = calendar.monthrange(2025, mm)[1]
        n = len(rows)
        docs = []
        for i, (val, motivo) in enumerate(rows):
            giorno = 1 if n <= 1 else min(gg, max(1, round(i / max(n - 1, 1) * (gg - 1)) + 1))
            docs.append(
                Expense(
                    data=f"{mese}-{giorno:02d}",
                    mese=mese,
                    importo=val,
                    motivo=motivo,
                    categoria=categorizza(motivo),
                    tag_persona=rileva_persona(motivo),
                    data_stimata=True,
                ).model_dump()
            )
        if docs:
            await db.expenses.insert_many(docs)
        totale_righe += len(docs)

        # totale manuale dichiarato
        await db.month_overrides.update_one(
            {"mese": mese},
            {"$set": {"mese": mese, "totale_manuale": DECLARED.get(mm)}},
            upsert=True,
        )

        somma = round(sum(v for v, _ in rows), 2)
        print(f"{mese}: {len(docs)} righe · somma {somma}€ · totale manuale {DECLARED.get(mm)}€")

    for mm, kv in km.items():
        if "ini" in kv and "fin" in kv:
            mese = f"2025-{mm:02d}"
            await db.monthly_km.update_one(
                {"mese": mese},
                {"$set": {"mese": mese, "km_iniziali": kv["ini"], "km_finali": kv["fin"]}},
                upsert=True,
            )
            print(f"km {mese}: {kv['ini']} -> {kv['fin']}")

    print(f"\nTotale righe importate: {totale_righe}")
    if warnings:
        print("Righe non riconosciute:")
        for w in warnings:
            print("  ", w)


if __name__ == "__main__":
    asyncio.run(main())

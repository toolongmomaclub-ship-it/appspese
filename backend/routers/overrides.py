import re

from fastapi import APIRouter, HTTPException

from lib.db import db
from models.schemas import MonthOverride, MonthOverrideUpdate

router = APIRouter(tags=["overrides"])

MESE_RE = r"^\d{4}-\d{2}$"


async def _sum(mese: str) -> float:
    rows = await db.expenses.find({"mese": mese}).to_list(20000)
    return round(sum(float(r["importo"]) for r in rows), 2)


def _valid(mese: str) -> None:
    if not re.match(MESE_RE, mese):
        raise HTTPException(status_code=400, detail="Formato mese non valido (atteso YYYY-MM)")


@router.get("/overrides", response_model=list[MonthOverride])
async def list_overrides():
    docs = await db.month_overrides.find().sort([("mese", 1)]).to_list(2000)
    out: list[MonthOverride] = []
    for d in docs:
        tm = d.get("totale_manuale")
        s = await _sum(d["mese"])
        out.append(
            MonthOverride(mese=d["mese"], totale_manuale=tm, totale_spese=s,
                          totale_effettivo=tm if tm is not None else s)
        )
    return out


@router.get("/overrides/{mese}", response_model=MonthOverride)
async def get_override(mese: str):
    _valid(mese)
    doc = await db.month_overrides.find_one({"mese": mese})
    tm = doc.get("totale_manuale") if doc else None
    s = await _sum(mese)
    return MonthOverride(mese=mese, totale_manuale=tm, totale_spese=s,
                         totale_effettivo=tm if tm is not None else s)


@router.put("/overrides/{mese}", response_model=MonthOverride)
async def set_override(mese: str, payload: MonthOverrideUpdate):
    _valid(mese)
    if payload.totale_manuale is None:
        await db.month_overrides.delete_one({"mese": mese})
    else:
        if payload.totale_manuale < 0:
            raise HTTPException(status_code=400, detail="Il totale non può essere negativo")
        await db.month_overrides.update_one(
            {"mese": mese},
            {"$set": {"mese": mese, "totale_manuale": round(payload.totale_manuale, 2)}},
            upsert=True,
        )
    tm = payload.totale_manuale
    s = await _sum(mese)
    return MonthOverride(mese=mese, totale_manuale=tm, totale_spese=s,
                         totale_effettivo=tm if tm is not None else s)

from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.store import fuel_aid, km_fatti, km_map
from models.schemas import (
    FuelSummary,
    FuelUpdate,
    KMUpdate,
    MonthlyKM,
    Subscriptions,
    SubscriptionsUpdate,
)

router = APIRouter(tags=["telemetry"])

MESE_RE = r"^\d{4}-\d{2}$"


def _valid(mese: str) -> None:
    import re

    if not re.match(MESE_RE, mese):
        raise HTTPException(status_code=400, detail="Formato mese non valido (atteso YYYY-MM)")


@router.get("/km", response_model=list[MonthlyKM])
async def list_km():
    docs = await db.monthly_km.find().sort([("mese", 1)]).to_list(1000)
    return [
        MonthlyKM(
            mese=d["mese"],
            km_iniziali=d.get("km_iniziali"),
            km_finali=d.get("km_finali"),
            km_fatti=km_fatti(d),
        )
        for d in docs
    ]


@router.get("/km/{mese}", response_model=MonthlyKM)
async def get_km(mese: str):
    _valid(mese)
    doc = await db.monthly_km.find_one({"mese": mese})
    if not doc:
        # precompila i km iniziali con i km finali del mese precedente
        prev = await db.monthly_km.find({"mese": {"$lt": mese}}).sort([("mese", -1)]).to_list(1)
        ki = prev[0].get("km_finali") if prev else None
        return MonthlyKM(mese=mese, km_iniziali=ki, km_finali=None, km_fatti=None)
    return MonthlyKM(
        mese=mese,
        km_iniziali=doc.get("km_iniziali"),
        km_finali=doc.get("km_finali"),
        km_fatti=km_fatti(doc),
    )


@router.put("/km/{mese}", response_model=MonthlyKM)
async def set_km(mese: str, payload: KMUpdate):
    _valid(mese)
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.monthly_km.update_one({"mese": mese}, {"$set": {"mese": mese, **upd}}, upsert=True)
    doc = await db.monthly_km.find_one({"mese": mese})
    if doc is None:
        raise HTTPException(status_code=500, detail="Impossibile leggere i km appena salvati")
    if doc.get("km_iniziali") is not None and doc.get("km_finali") is not None:
        if int(doc["km_finali"]) < int(doc["km_iniziali"]):
            raise HTTPException(status_code=400, detail="I km finali non possono essere minori degli iniziali")
    return MonthlyKM(
        mese=mese,
        km_iniziali=doc.get("km_iniziali"),
        km_finali=doc.get("km_finali"),
        km_fatti=km_fatti(doc),
    )


async def _fuel(mese: str) -> FuelSummary:
    rows = await db.expenses.find({"mese": mese, "categoria": "Carburante"}).to_list(2000)
    lordo = round(sum(float(r["importo"]) for r in rows), 2)
    aiuto = await fuel_aid(mese)
    netto = round(lordo - aiuto, 2)
    kms = await km_map()
    kf = km_fatti(kms.get(mese))
    epk = round(netto / kf, 4) if kf and kf > 0 else None
    return FuelSummary(
        mese=mese,
        totale_carburante_lordo=lordo,
        aiuto_esterno=aiuto,
        totale_netto=netto,
        km_fatti=kf,
        euro_per_km=epk,
    )


@router.get("/fuel/{mese}", response_model=FuelSummary)
async def get_fuel(mese: str):
    _valid(mese)
    return await _fuel(mese)


@router.put("/fuel/{mese}", response_model=FuelSummary)
async def set_fuel(mese: str, payload: FuelUpdate):
    _valid(mese)
    if payload.aiuto_esterno < 0:
        raise HTTPException(status_code=400, detail="L'aiuto esterno non può essere negativo")
    await db.fuel_adjustments.update_one(
        {"mese": mese},
        {"$set": {"mese": mese, "aiuto_esterno": round(payload.aiuto_esterno, 2)}},
        upsert=True,
    )
    return await _fuel(mese)


DEFAULT_SUBS = [
    {"nome": "chat", "importo": 23.0},
    {"nome": "icloud", "importo": 10.0},
    {"nome": "amazon", "importo": 5.0},
    {"nome": "google", "importo": 3.0},
]


@router.get("/subscriptions", response_model=Subscriptions)
async def get_subs():
    doc = await db.subscriptions.find_one({"id": "fissi"})
    voci = doc["voci"] if doc else DEFAULT_SUBS
    return Subscriptions(voci=voci, totale=round(sum(v["importo"] for v in voci), 2))


@router.put("/subscriptions", response_model=Subscriptions)
async def set_subs(payload: SubscriptionsUpdate):
    voci = [v.model_dump() for v in payload.voci]
    await db.subscriptions.update_one(
        {"id": "fissi"}, {"$set": {"id": "fissi", "voci": voci}}, upsert=True
    )
    return Subscriptions(voci=payload.voci, totale=round(sum(v["importo"] for v in voci), 2))

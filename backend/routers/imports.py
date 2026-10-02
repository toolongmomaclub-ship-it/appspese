from fastapi import APIRouter, HTTPException

from lib.categorize import categorizza, rileva_persona
from lib.db import db
from lib.parser import parse_testo
from lib.store import learned_rules
from models.schemas import (
    Expense,
    ImportMonth,
    ImportPreview,
    ImportRequest,
    ImportResult,
    ImportRow,
)

router = APIRouter(tags=["import"])


async def _build(req: ImportRequest) -> ImportPreview:
    if not req.testo.strip():
        raise HTTPException(status_code=400, detail="Testo vuoto")
    parsed = parse_testo(req.testo, req.anno)
    rules = await learned_rules()
    mesi: list[ImportMonth] = []
    for b in parsed["mesi"]:
        righe = [
            ImportRow(
                data=r["data"],
                importo=r["importo"],
                motivo=r["motivo"],
                categoria=categorizza(r["motivo"], rules),
                tag_persona=rileva_persona(r["motivo"]),
                note_extra=r["note_extra"],
            )
            for r in b["righe"]
        ]
        mesi.append(
            ImportMonth(
                mese=b["mese"],
                nome=b["nome"],
                km_iniziali=b["km_iniziali"],
                km_finali=b["km_finali"],
                aiuto_esterno=b["aiuto_esterno"],
                totale_dichiarato=b["totale_dichiarato"],
                totale_calcolato=b["totale_calcolato"],
                righe=righe,
            )
        )
    if not mesi:
        raise HTTPException(status_code=400, detail="Nessun blocco mensile riconosciuto nel testo")
    return ImportPreview(
        anno=parsed["anno"],
        mesi=mesi,
        warnings=parsed["warnings"],
        totale_righe=sum(len(m.righe) for m in mesi),
    )


@router.post("/import/preview", response_model=ImportPreview)
async def preview(req: ImportRequest):
    return await _build(req)


@router.post("/import/commit", response_model=ImportResult)
async def commit(req: ImportRequest):
    prev = await _build(req)
    inserite = 0
    mesi: list[str] = []
    for m in prev.mesi:
        # idempotente: rimpiazzo il mese importato
        await db.expenses.delete_many({"mese": m.mese})
        docs = [
            Expense(
                data=r.data,
                mese=m.mese,
                importo=r.importo,
                motivo=r.motivo,
                categoria=r.categoria,
                tag_persona=r.tag_persona,
                note_extra=r.note_extra,
                data_stimata=True,
            ).model_dump()
            for r in m.righe
        ]
        if docs:
            await db.expenses.insert_many(docs)
            inserite += len(docs)
        km_set = {k: v for k, v in
                  {"km_iniziali": m.km_iniziali, "km_finali": m.km_finali}.items() if v is not None}
        if km_set:
            await db.monthly_km.update_one(
                {"mese": m.mese}, {"$set": {"mese": m.mese, **km_set}}, upsert=True
            )
        if m.aiuto_esterno:
            await db.fuel_adjustments.update_one(
                {"mese": m.mese},
                {"$set": {"mese": m.mese, "aiuto_esterno": m.aiuto_esterno}},
                upsert=True,
            )
        mesi.append(m.mese)
    return ImportResult(inserite=inserite, mesi=mesi, warnings=prev.warnings)

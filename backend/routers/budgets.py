from __future__ import annotations

import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException

from lib.categorize import CATEGORIE
from lib.db import db
from models.schemas import BudgetCategory, BudgetCategoryUpdate

router = APIRouter(prefix="/budget", tags=["budget"])


async def _seed_categories() -> None:
    if await db.categories.count_documents({}) == 0:
        docs = [
            {"key": n, "nome": n, "builtin": True, "order": (9999 if n == "Varie" else i), "budget_mensile": None}
            for i, n in enumerate(CATEGORIE)
        ]
        await db.categories.insert_many(docs)


async def _category_names() -> list[str]:
    docs = await db.categories.find().sort([("order", 1), ("nome", 1)]).to_list(500)
    return [doc["nome"] for doc in docs]


async def _budget_for_category(nome: str, mese: str | None = None) -> BudgetCategory:
    doc = await db.categories.find_one({"nome": nome})
    if not doc:
        raise HTTPException(status_code=404, detail="Categoria non trovata")

    current_mese = mese or datetime.now().strftime("%Y-%m")
    spent_doc = await db.expenses.aggregate(
        [
            {"$match": {"categoria": nome, "mese": current_mese}},
            {"$group": {"_id": "$categoria", "totale": {"$sum": "$importo"}}},
        ]
    ).to_list(1)
    totale_speso = float(spent_doc[0]["totale"]) if spent_doc else 0.0

    budget_raw = doc.get("budget_mensile")
    budget_mensile = float(budget_raw) if budget_raw is not None else None

    if budget_mensile is None:
        rimanente = None
        percentuale = 0.0
    else:
        rimanente = round(budget_mensile - totale_speso, 2)
        percentuale = round((totale_speso / budget_mensile) * 100, 2) if budget_mensile > 0 else 0.0

    return BudgetCategory(
        nome=nome,
        budget_mensile=budget_mensile,
        totale_speso=round(totale_speso, 2),
        rimanente=rimanente,
        percentuale=percentuale,
        mese=current_mese,
    )


@router.get("/categories", response_model=list[BudgetCategory])
async def list_budget_categories():
    await _seed_categories()
    category_names = await _category_names()
    return await asyncio.gather(*[_budget_for_category(nome) for nome in category_names])


@router.get("/categories/{nome}", response_model=BudgetCategory)
async def get_budget_category(nome: str):
    await _seed_categories()
    return await _budget_for_category(nome)


@router.patch("/categories/{nome}", response_model=BudgetCategory)
async def update_budget_category(nome: str, payload: BudgetCategoryUpdate):
    await _seed_categories()
    doc = await db.categories.find_one({"nome": nome})
    if not doc:
        raise HTTPException(status_code=404, detail="Categoria non trovata")

    if payload.budget_mensile is not None and payload.budget_mensile < 0:
        raise HTTPException(status_code=400, detail="Il budget non può essere negativo")

    await db.categories.update_one({"nome": nome}, {"$set": {"budget_mensile": payload.budget_mensile}})
    return await _budget_for_category(nome)

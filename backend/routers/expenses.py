import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from lib.categorize import CATEGORIE, categorizza, rileva_persona
from lib.dates import today_iso
from lib.db import db
from lib.store import learned_rules
from models.schemas import (
    CategoryCreate,
    CategoryRename,
    Expense,
    ExpenseCreate,
    ExpenseUpdate,
    KeywordRule,
)

router = APIRouter(tags=["expenses"])


async def _seed_categories() -> None:
    if await db.categories.count_documents({}) == 0:
        docs = [
            {
                "key": n,
                "nome": n,
                "builtin": True,
                "order": (9999 if n == "Varie" else i),
                "budget_mensile": None,
            }
            for i, n in enumerate(CATEGORIE)
        ]
        await db.categories.insert_many(docs)


async def category_names() -> list[str]:
    await _seed_categories()
    docs = await db.categories.find().sort([("order", 1), ("nome", 1)]).to_list(500)
    return [d["nome"] for d in docs]


async def display_for(canonical: str) -> str:
    """Mappa il nome canonico (key built-in) sul nome visualizzato, eventualmente rinominato."""
    doc = await db.categories.find_one({"key": canonical})
    return doc["nome"] if doc else canonical


@router.get("/expenses", response_model=list[Expense])
async def list_expenses(
    mese: Optional[str] = Query(None),
    anno: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    persona: Optional[str] = Query(None),
    da: Optional[str] = Query(None),
    a: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
):
    flt: dict = {}
    if mese:
        flt["mese"] = mese
    elif anno:
        flt["mese"] = {"$regex": f"^{anno}-"}
    if da or a:
        rng: dict = {}
        if da:
            rng["$gte"] = da
        if a:
            rng["$lte"] = a
        flt["data"] = rng
    if categoria:
        flt["categoria"] = categoria
    if persona:
        flt["tag_persona"] = persona
    if q:
        flt["motivo"] = {"$regex": q, "$options": "i"}
    docs = await db.expenses.find(flt).sort([("data", -1)]).to_list(5000)
    return [Expense(**d) for d in docs]


@router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate):
    if payload.importo <= 0:
        raise HTTPException(status_code=400, detail="L'importo deve essere maggiore di zero")
    if not payload.motivo.strip():
        raise HTTPException(status_code=400, detail="Il motivo è obbligatorio")
    data = payload.data or today_iso()
    rules = await learned_rules()
    if payload.categoria is not None:
        categoria = payload.categoria
    else:
        categoria = await display_for(categorizza(payload.motivo, rules))
    exp = Expense(
        data=data,
        mese=data[:7],
        importo=round(payload.importo, 2),
        motivo=payload.motivo.strip(),
        categoria=categoria,
        categoria_manuale=payload.categoria is not None,
        tag_persona=payload.tag_persona or rileva_persona(payload.motivo),
        note_extra=payload.note_extra,
    )
    await db.expenses.insert_one(exp.model_dump())
    return exp


@router.patch("/expenses/{id}", response_model=Expense)
async def update_expense(id: str, payload: ExpenseUpdate):
    doc = await db.expenses.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Spesa non trovata")
    upd = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "data" in upd:
        upd["mese"] = upd["data"][:7]
    if "categoria" in upd:
        upd["categoria_manuale"] = True
    if upd:
        await db.expenses.update_one({"id": id}, {"$set": upd})
    doc = await db.expenses.find_one({"id": id})
    return Expense(**doc)  # type: ignore[arg-type]


@router.delete("/expenses/{id}")
async def delete_expense(id: str):
    res = await db.expenses.delete_one({"id": id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Spesa non trovata")
    return {"ok": True, "id": id}


@router.get("/categories", response_model=list[str])
async def list_categories():
    return await category_names()


@router.post("/categories", response_model=list[str])
async def create_category(payload: CategoryCreate):
    nome = payload.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Il nome è obbligatorio")
    await _seed_categories()
    if await db.categories.find_one({"nome": nome}):
        raise HTTPException(status_code=400, detail="Esiste già una categoria con questo nome")
    await db.categories.insert_one(
        {"key": str(uuid.uuid4()), "nome": nome, "builtin": False, "order": 500, "budget_mensile": None}
    )
    return await category_names()


@router.patch("/categories", response_model=list[str])
async def rename_category(payload: CategoryRename):
    old, new = payload.old.strip(), payload.new.strip()
    if not new:
        raise HTTPException(status_code=400, detail="Il nuovo nome è obbligatorio")
    await _seed_categories()
    doc = await db.categories.find_one({"nome": old})
    if not doc:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    if old == new:
        return await category_names()
    if await db.categories.find_one({"nome": new}):
        raise HTTPException(status_code=400, detail="Esiste già una categoria con questo nome")
    await db.categories.update_one({"key": doc["key"]}, {"$set": {"nome": new}})
    await db.expenses.update_many({"categoria": old}, {"$set": {"categoria": new}})
    await db.keyword_rules.update_many({"categoria": old}, {"$set": {"categoria": new}})
    return await category_names()


@router.get("/categories/rules", response_model=list[KeywordRule])
async def list_rules():
    docs = await db.keyword_rules.find().to_list(2000)
    return [KeywordRule(**d) for d in docs]


@router.post("/categories/rules", response_model=KeywordRule)
async def add_rule(rule: KeywordRule):
    if rule.categoria not in await category_names():
        raise HTTPException(status_code=400, detail="Categoria sconosciuta")
    parola = rule.parola.strip().lower()
    if not parola:
        raise HTTPException(status_code=400, detail="Parola vuota")
    await db.keyword_rules.update_one(
        {"parola": parola}, {"$set": {"parola": parola, "categoria": rule.categoria}}, upsert=True
    )
    return KeywordRule(parola=parola, categoria=rule.categoria)


@router.get("/categorize", response_model=dict)
async def preview_category(motivo: str):
    rules = await learned_rules()
    return {"categoria": categorizza(motivo, rules), "tag_persona": rileva_persona(motivo)}

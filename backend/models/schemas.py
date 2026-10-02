import uuid
from typing import Optional

from pydantic import BaseModel, Field


class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str                      # YYYY-MM-DD
    mese: str                      # YYYY-MM
    importo: float
    motivo: str
    categoria: str
    categoria_manuale: bool = False
    tag_persona: Optional[str] = None
    note_extra: Optional[str] = None
    data_stimata: bool = False


class ExpenseCreate(BaseModel):
    data: Optional[str] = None
    importo: float
    motivo: str
    categoria: Optional[str] = None
    tag_persona: Optional[str] = None
    note_extra: Optional[str] = None


class ExpenseUpdate(BaseModel):
    data: Optional[str] = None
    importo: Optional[float] = None
    motivo: Optional[str] = None
    categoria: Optional[str] = None
    tag_persona: Optional[str] = None
    note_extra: Optional[str] = None


class MonthlyKM(BaseModel):
    mese: str
    km_iniziali: Optional[int] = None
    km_finali: Optional[int] = None
    km_fatti: Optional[int] = None


class KMUpdate(BaseModel):
    km_iniziali: Optional[int] = None
    km_finali: Optional[int] = None


class FuelSummary(BaseModel):
    mese: str
    totale_carburante_lordo: float
    aiuto_esterno: float
    totale_netto: float
    km_fatti: Optional[int] = None
    euro_per_km: Optional[float] = None


class FuelUpdate(BaseModel):
    aiuto_esterno: float


class SubscriptionItem(BaseModel):
    nome: str
    importo: float


class Subscriptions(BaseModel):
    voci: list[SubscriptionItem]
    totale: float


class SubscriptionsUpdate(BaseModel):
    voci: list[SubscriptionItem]


class CategoryTotal(BaseModel):
    categoria: str
    totale: float
    conteggio: int
    percentuale: float


class MonthPoint(BaseModel):
    mese: str
    totale: float
    manuale: bool = False


class MonthOverride(BaseModel):
    mese: str
    totale_manuale: Optional[float] = None
    totale_spese: float
    totale_effettivo: float


class MonthOverrideUpdate(BaseModel):
    totale_manuale: Optional[float] = None


class MotivoTotal(BaseModel):
    motivo: str
    totale: float
    conteggio: int


class WeekdayPoint(BaseModel):
    giorno: str
    totale: float
    media: float


class AnalyticsSummary(BaseModel):
    periodo: str
    totale: float
    conteggio: int
    media_giornaliera: float
    totale_precedente: float
    variazione_pct: Optional[float] = None
    categorie: list[CategoryTotal]
    proiezione_fine_mese: Optional[float] = None
    totale_spese: float = 0.0
    totale_manuale: Optional[float] = None


class Dashboard(BaseModel):
    trend: list[MonthPoint]
    top_categorie: list[CategoryTotal]
    top_motivi_importo: list[MotivoTotal]
    top_motivi_frequenza: list[MotivoTotal]
    weekday: list[WeekdayPoint]
    euro_per_km: list[MonthPoint]
    totale_anno: float
    totale_mese_corrente: float
    proiezione_fine_mese: float
    km_anno: int


class ImportRequest(BaseModel):
    testo: str
    anno: int = 2026


class ImportRow(BaseModel):
    data: str
    importo: float
    motivo: str
    categoria: str
    tag_persona: Optional[str] = None
    note_extra: Optional[str] = None


class ImportMonth(BaseModel):
    mese: str
    nome: str
    km_iniziali: Optional[int] = None
    km_finali: Optional[int] = None
    aiuto_esterno: float = 0.0
    totale_dichiarato: Optional[float] = None
    totale_calcolato: float
    righe: list[ImportRow]


class ImportPreview(BaseModel):
    anno: int
    mesi: list[ImportMonth]
    warnings: list[str]
    totale_righe: int


class ImportResult(BaseModel):
    inserite: int
    mesi: list[str]
    warnings: list[str]


class KeywordRule(BaseModel):
    parola: str
    categoria: str


class CategoryCreate(BaseModel):
    nome: str


class CategoryRename(BaseModel):
    old: str
    new: str


class BudgetCategory(BaseModel):
    nome: str
    budget_mensile: Optional[float] = None
    totale_speso: float = 0.0
    rimanente: Optional[float] = None
    percentuale: float = 0.0
    mese: str


class BudgetCategoryUpdate(BaseModel):
    budget_mensile: Optional[float] = None

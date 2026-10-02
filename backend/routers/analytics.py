import calendar
from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

from lib.dates import today_iso
from lib.db import db
from lib.store import fuel_aid, km_fatti, km_map, override_map
from models.schemas import (
    AnalyticsSummary,
    CategoryTotal,
    Dashboard,
    MonthPoint,
    MotivoTotal,
    WeekdayPoint,
)

router = APIRouter(tags=["analytics"])

GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]


def _prev_month(mese: str) -> str:
    y, m = int(mese[:4]), int(mese[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def _cat_totals(rows: list[dict]) -> list[CategoryTotal]:
    agg: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in rows:
        a = agg[r["categoria"]]
        a[0] += float(r["importo"])
        a[1] += 1
    tot = sum(v[0] for v in agg.values()) or 1.0
    out = [
        CategoryTotal(
            categoria=c,
            totale=round(v[0], 2),
            conteggio=int(v[1]),
            percentuale=round(v[0] / tot * 100, 1),
        )
        for c, v in agg.items()
    ]
    return sorted(out, key=lambda c: -c.totale)


@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def summary(
    mese: Optional[str] = Query(None),
    anno: Optional[str] = Query(None),
    da: Optional[str] = Query(None),
    a: Optional[str] = Query(None),
):
    oggi = today_iso()
    ov = await override_map()

    if da or a:
        rng: dict = {}
        if da:
            rng["$gte"] = da
        if a:
            rng["$lte"] = a
        rows = await db.expenses.find({"data": rng}).to_list(20000)
        prev_rows: list[dict] = []
        periodo = f"{da or '…'} → {a or '…'}"
        giorni = 1
        if da and a:
            d1, d2 = date.fromisoformat(da), date.fromisoformat(a)
            giorni = max((d2 - d1).days + 1, 1)
        totale_spese = round(sum(float(r["importo"]) for r in rows), 2)
        totale = totale_spese
        totale_manuale = None
        tot_prev = 0.0
        proiezione = None
    elif anno and not mese:
        rows = await db.expenses.find({"mese": {"$regex": f"^{anno}-"}}).to_list(20000)
        prev_rows = await db.expenses.find(
            {"mese": {"$regex": f"^{int(anno) - 1}-"}}
        ).to_list(20000)
        periodo = anno
        giorni = 366 if calendar.isleap(int(anno)) else 365
        if anno == oggi[:4]:
            giorni = date.fromisoformat(oggi).timetuple().tm_yday

        sums: dict[str, float] = defaultdict(float)
        for r in rows:
            sums[r["mese"]] += float(r["importo"])
        totale_spese = round(sum(sums.values()), 2)
        totale = round(_year_effective(anno, sums, ov), 2)

        prev_sums: dict[str, float] = defaultdict(float)
        for r in prev_rows:
            prev_sums[r["mese"]] += float(r["importo"])
        tot_prev = round(_year_effective(str(int(anno) - 1), prev_sums, ov), 2)

        totale_manuale = None
        proiezione = None
    else:
        m = mese or oggi[:7]
        rows = await db.expenses.find({"mese": m}).to_list(20000)
        prev_rows = await db.expenses.find({"mese": _prev_month(m)}).to_list(20000)
        periodo = m
        gg_mese = calendar.monthrange(int(m[:4]), int(m[5:7]))[1]
        giorni = date.fromisoformat(oggi).day if m == oggi[:7] else gg_mese

        totale_spese = round(sum(float(r["importo"]) for r in rows), 2)
        totale_manuale = ov.get(m)
        totale = totale_manuale if totale_manuale is not None else totale_spese

        prev_spese = round(sum(float(r["importo"]) for r in prev_rows), 2)
        prev_ov = ov.get(_prev_month(m))
        tot_prev = prev_ov if prev_ov is not None else prev_spese

        if totale_manuale is not None:
            proiezione = round(totale_manuale, 2)
        else:
            proiezione = round(totale_spese / max(giorni, 1) * gg_mese, 2)

    var = round((totale - tot_prev) / tot_prev * 100, 1) if tot_prev > 0 else None

    return AnalyticsSummary(
        periodo=periodo,
        totale=round(totale, 2),
        conteggio=len(rows),
        media_giornaliera=round(totale / max(giorni, 1), 2),
        totale_precedente=round(tot_prev, 2),
        variazione_pct=var,
        categorie=_cat_totals(rows),
        proiezione_fine_mese=proiezione,
        totale_spese=totale_spese,
        totale_manuale=totale_manuale,
    )


def _year_effective(anno: str, sums: dict[str, float], ov: dict[str, float]) -> float:
    mesi = {f"{anno}-{m:02d}" for m in range(1, 13)}
    mesi |= {k for k in ov if k.startswith(f"{anno}-")}
    return sum(ov.get(mm, round(sums.get(mm, 0.0), 2)) for mm in mesi)


@router.get("/analytics/category-trend", response_model=list[MonthPoint])
async def category_trend(categoria: str, anno: Optional[str] = Query(None)):
    y = anno or today_iso()[:4]
    rows = await db.expenses.find(
        {"mese": {"$regex": f"^{y}-"}, "categoria": categoria}
    ).to_list(30000)
    per: dict[str, float] = defaultdict(float)
    for r in rows:
        per[r["mese"]] += float(r["importo"])
    return [
        MonthPoint(mese=f"{y}-{m:02d}", totale=round(per.get(f"{y}-{m:02d}", 0.0), 2))
        for m in range(1, 13)
    ]


@router.get("/analytics/dashboard", response_model=Dashboard)
async def dashboard(anno: Optional[str] = Query(None)):
    oggi = today_iso()
    y = anno or oggi[:4]
    ov = await override_map()
    rows_anno = await db.expenses.find({"mese": {"$regex": f"^{y}-"}}).to_list(30000)

    sums: dict[str, float] = defaultdict(float)
    for r in rows_anno:
        sums[r["mese"]] += float(r["importo"])

    trend: list[MonthPoint] = []
    for m in range(1, 13):
        mm = f"{y}-{m:02d}"
        manual = ov.get(mm)
        trend.append(
            MonthPoint(
                mese=mm,
                totale=round(manual if manual is not None else sums.get(mm, 0.0), 2),
                manuale=manual is not None,
            )
        )

    motivi: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    wd: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in rows_anno:
        key = r["motivo"].strip().lower()
        motivi[key][0] += float(r["importo"])
        motivi[key][1] += 1
        try:
            i = date.fromisoformat(r["data"]).weekday()
        except ValueError:
            continue
        wd[i][0] += float(r["importo"])
        wd[i][1] += 1

    top_imp = sorted(
        [MotivoTotal(motivo=k, totale=round(v[0], 2), conteggio=int(v[1])) for k, v in motivi.items()],
        key=lambda x: -x.totale,
    )[:5]
    top_freq = sorted(
        [MotivoTotal(motivo=k, totale=round(v[0], 2), conteggio=int(v[1])) for k, v in motivi.items()],
        key=lambda x: -x.conteggio,
    )[:5]
    weekday = [
        WeekdayPoint(
            giorno=GIORNI[i],
            totale=round(wd[i][0], 2),
            media=round(wd[i][0] / wd[i][1], 2) if wd[i][1] else 0.0,
        )
        for i in range(7)
    ]

    kms = await km_map()
    epk: list[MonthPoint] = []
    km_tot = 0
    for m in range(1, 13):
        mm = f"{y}-{m:02d}"
        kf = km_fatti(kms.get(mm))
        if kf:
            km_tot += kf
        carb = sum(
            float(r["importo"]) for r in rows_anno
            if r["mese"] == mm and r["categoria"] == "Carburante"
        )
        aiuto = await fuel_aid(mm)
        netto = max(carb - aiuto, 0.0)
        epk.append(MonthPoint(mese=mm, totale=round(netto / kf, 3) if kf and kf > 0 else 0.0))

    mese_corr = oggi[:7] if oggi[:4] == y else f"{y}-12"
    corr_manual = ov.get(mese_corr)
    tot_mese = round(corr_manual if corr_manual is not None else sums.get(mese_corr, 0.0), 2)
    gg_mese = calendar.monthrange(int(mese_corr[:4]), int(mese_corr[5:7]))[1]
    gg_passati = date.fromisoformat(oggi).day if mese_corr == oggi[:7] else gg_mese
    proiezione = tot_mese if corr_manual is not None else round(tot_mese / max(gg_passati, 1) * gg_mese, 2)

    return Dashboard(
        trend=trend,
        top_categorie=_cat_totals(rows_anno)[:5],
        top_motivi_importo=top_imp,
        top_motivi_frequenza=top_freq,
        weekday=weekday,
        euro_per_km=epk,
        totale_anno=round(sum(p.totale for p in trend), 2),
        totale_mese_corrente=tot_mese,
        proiezione_fine_mese=round(proiezione, 2),
        km_anno=km_tot,
    )

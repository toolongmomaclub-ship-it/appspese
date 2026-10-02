"""Parser del formato libero usato nei file SPESE <anno>.txt."""

import calendar
import re
from typing import Optional

MESI = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}

_AMOUNT = re.compile(r"^\s*(\d+(?:[.,]\d{1,2})?)\s*(.*)$")
_KM = re.compile(r"km\s*(iniziali|finali|fatti)?\s*[-—:]*\s*(\d+)?", re.I)
_QUOTED = re.compile(r"[‘'\"“](.+?)[’'\"”]")


def _num(raw: str) -> float:
    return round(float(raw.replace(",", ".")), 2)


def parse_testo(testo: str, anno_default: int) -> dict:
    """Ritorna {anno, mesi: [{mese, nome, km_iniziali, km_finali, aiuto_esterno,
    totale_dichiarato, righe: [{data, importo, motivo, note_extra}]}], warnings: []}"""
    anno = anno_default
    m_anno = re.search(r"\b(20\d{2})\b", testo.split("\n")[0] if testo else "")
    if m_anno:
        anno = int(m_anno.group(1))

    blocchi: list[dict] = []
    warnings: list[str] = []
    corrente: Optional[dict] = None

    for raw in testo.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower()

        nome_mese = low.rstrip(" :.-–—")
        if nome_mese in MESI:
            corrente = {
                "mese": f"{anno}-{MESI[nome_mese]:02d}",
                "nome": nome_mese.capitalize(),
                "km_iniziali": None,
                "km_finali": None,
                "aiuto_esterno": 0.0,
                "totale_dichiarato": None,
                "righe": [],
            }
            blocchi.append(corrente)
            continue

        if re.match(r"^spese\s+20\d{2}", low):
            continue

        if low.startswith("km"):
            mk = _KM.search(low)
            if mk and corrente is not None:
                kind, val = mk.group(1), mk.group(2)
                if val:
                    if kind == "finali":
                        corrente["km_finali"] = int(val)
                    elif kind == "fatti":
                        pass
                    else:
                        corrente["km_iniziali"] = int(val)
            continue

        if low.startswith("€ spesi") or low.startswith("e spesi"):
            continue

        if low.startswith("tot"):
            mt = re.search(r"(\d[\d.,\s]*)", line[3:])
            if mt and corrente is not None and corrente["totale_dichiarato"] is None:
                cleaned = mt.group(1).replace(" ", "").replace(",", ".").rstrip(".")
                try:
                    corrente["totale_dichiarato"] = round(float(cleaned), 2)
                except ValueError:
                    pass
            continue

        if line.startswith("+"):
            ma = re.search(r"\+\s*(\d+(?:[.,]\d{1,2})?)", line)
            if ma and corrente is not None:
                corrente["aiuto_esterno"] = round(corrente["aiuto_esterno"] + _num(ma.group(1)), 2)
            continue

        if low.startswith("abbonamenti -") or low.startswith("abbonamenti-"):
            continue

        ma = _AMOUNT.match(line)
        if not ma or corrente is None:
            if corrente is not None:
                warnings.append(f"Riga ignorata: «{line}»")
            continue

        importo = _num(ma.group(1))
        motivo = ma.group(2).strip().strip("?").strip()
        note = None
        mq = _QUOTED.search(motivo)
        if mq:
            note = mq.group(1).strip()
            motivo = _QUOTED.sub("", motivo).strip()
        if not motivo:
            motivo = "non specificato"
        corrente["righe"].append({"importo": importo, "motivo": motivo, "note_extra": note})

    # date stimate: distribuisco le righe in ordine sui giorni del mese
    for b in blocchi:
        y, m = int(b["mese"][:4]), int(b["mese"][5:7])
        gg = calendar.monthrange(y, m)[1]
        n = len(b["righe"])
        for i, r in enumerate(b["righe"]):
            giorno = 1 if n <= 1 else min(gg, max(1, round((i / max(n - 1, 1)) * (gg - 1)) + 1))
            r["data"] = f"{y:04d}-{m:02d}-{giorno:02d}"
        somma = round(sum(r["importo"] for r in b["righe"]), 2)
        b["totale_calcolato"] = somma
        if b["totale_dichiarato"] is not None and abs(somma - b["totale_dichiarato"]) > 0.5:
            warnings.append(
                f"{b['nome']}: totale calcolato {somma:.2f}€ ≠ totale dichiarato "
                f"{b['totale_dichiarato']:.2f}€"
            )

    return {"anno": anno, "mesi": blocchi, "warnings": warnings}

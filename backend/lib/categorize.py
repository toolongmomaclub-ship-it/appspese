"""Motore di auto-categorizzazione: mappatura parola chiave -> categoria."""

from typing import Optional

CATEGORIE: list[str] = [
    "Carburante",
    "Sigarette",
    "Abbonamenti",
    "Bar & Cibo",
    "Regali",
    "Giulia",
    "Lety",
    "Gioco",
    "Trasporti",
    "Rate",
    "Salute",
    "Multe",
    "Eventi & Vacanze",
    "Risparmio",
    "Varie",
]

# Ordine = priorita'. Match per parola intera (o prefisso di parola).
REGOLE: list[tuple[str, list[str]]] = [
    ("Giulia", ["giulia"]),
    ("Lety", ["lety", "leti"]),
    ("Carburante", ["benza", "benzina", "gpl", "diesel", "gasolio", "eni", "q8", "carburante"]),
    ("Sigarette", ["siga", "sigarette", "terea", "cicche", "accendino", "tabacchi"]),
    ("Abbonamenti", ["abbonamenti", "abbonamento", "chat", "icloud", "amazon", "google",
                     "cursor", "capcut", "shopify", "bitstack", "paypal", "netflix", "spotify"]),
    ("Multe", ["multa", "multe"]),
    ("Gioco", ["sisal", "slot", "gratta", "grattino", "scommesse", "scommessa",
               "macchinette", "schedina", "golbet", "eurobet", "goldbet", "snai",
               "lottomatica"]),
    ("Salute", ["parrucchiere", "cerotti", "polase", "preservativi", "gravidanza",
                "farmacia", "medico", "tampax", "creme", "lubrificante", "salva pelle"]),
    ("Trasporti", ["parcheggio", "autostrada", "metro", "biglietti", "lavaggio",
                   "autolavaggio", "telepass", "treno", "pedaggio"]),
    ("Rate", ["rata", "rate", "scalapay"]),
    ("Risparmio", ["investimento", "revolut"]),
    ("Eventi & Vacanze", ["mare", "torneo", "festa", "festino", "compleanno", "terme",
                          "sagra", "pasquetta", "perdono", "piscina", "cinema", "tattoo",
                          "viaggio", "roma", "praga", "hotel", "albergo", "ostello",
                          "airbnb", "volo", "gita", "vacanza", "vacanze",
                          "valencia", "brasile", "pietra"]),
    ("Regali", ["regalo", "regali", "fiori", "fiore", "rosa", "rose", "mimose",
                "bracciale", "anello", "collana", "pandora", "souvenir", "polaroid"]),
    ("Bar & Cibo", ["caffè", "caffe", "colazione", "pranzo", "cena", "merenda", "merende",
                    "panino", "pizza", "mc", "gelato", "aperitivo", "ape", "spritz", "drink",
                    "birra", "birre", "bere", "brioche", "granita", "granite", "focaccia",
                    "piada", "sushi", "conad", "coop", "acqua", "acque", "shot", "amaro",
                    "campari", "vino", "spumante", "deliveroo", "poke", "grigliata",
                    "patatine", "torte", "cioccolatini", "chiacchere", "gocciole", "pre",
                    "barrette", "succo", "olive", "ciambella", "panna", "maionese", "pane"]),
]

_LOOKUP: list[tuple[str, str]] = sorted(
    [(kw, cat) for cat, kws in REGOLE for kw in kws],
    key=lambda p: -len(p[0]),
)


def _tokens(motivo: str) -> list[str]:
    cleaned = "".join(c if c.isalnum() or c.isspace() else " " for c in motivo.lower())
    return cleaned.split()


def categorizza(motivo: str, extra: Optional[dict[str, str]] = None) -> str:
    """Restituisce la categoria dedotta dal motivo. `extra` = regole apprese parola->categoria."""
    toks = _tokens(motivo)
    if not toks:
        return "Varie"
    if extra:
        for t in toks:
            if t in extra:
                return extra[t]
    # priorita' ordinata: scorro le REGOLE nell'ordine dichiarato
    for cat, kws in REGOLE:
        for kw in kws:
            k = kw.lower()
            for t in toks:
                if t == k or (len(k) > 3 and t.startswith(k)):
                    return cat
    # fallback: match parziale su tutta la stringa per keyword lunghe
    low = motivo.lower()
    for kw, cat in _LOOKUP:
        if len(kw) > 4 and kw in low:
            return cat
    return "Varie"


def rileva_persona(motivo: str) -> Optional[str]:
    toks = _tokens(motivo)
    for p in ("giulia",):
        if p in toks:
            return p
    return None

# Spese Tracker — spec viva

App italiana responsive (mobile + desktop) per tracciare spese quotidiane, km auto e carburante.
Nessuna autenticazione (scelta utente).

## Stack
FastAPI + MongoDB (motor) · Vite + React 19 + Tailwind v4 + shadcn/ui + Recharts.
Tema dark obsidian (#0B0F14 / #131B24), font Manrope (heading) / DM Sans (body) / JetBrains Mono (numeri).

## Modello dati (collections)
- `expenses`: id, data (YYYY-MM-DD), mese (YYYY-MM), importo, motivo, categoria,
  categoria_manuale, tag_persona, note_extra, data_stimata
- `monthly_km`: mese, km_iniziali, km_finali (km_fatti calcolato)
- `fuel_adjustments`: mese, aiuto_esterno
- `keyword_rules`: parola → categoria (auto-apprendimento)
- `subscriptions`: id="fissi", voci [{nome, importo}]

## Categorie
Carburante, Sigarette, Abbonamenti, Bar & Cibo, Regali & Giulia, Gioco, Trasporti, Rate,
Salute, Multe, Eventi & Vacanze, Risparmio, Varie. Motore in `backend/lib/categorize.py`.

## API (tutte sotto /api)
- GET/POST `/expenses`, PATCH/DELETE `/expenses/{id}` — filtri: mese, anno, categoria, persona, da, a, q
- GET `/categories`, GET/POST `/categories/rules`, GET `/categorize?motivo=`
- GET `/km`, GET/PUT `/km/{mese}` (precompila iniziali con finali del mese precedente)
- GET/PUT `/fuel/{mese}` (lordo auto, aiuto esterno, netto, €/km)
- GET/PUT `/subscriptions`
- GET `/analytics/summary?mese|anno|da&a`, GET `/analytics/dashboard?anno`
- POST `/import/preview`, POST `/import/commit` (idempotente: rimpiazza i mesi presenti nel testo)

## Pagine
`/` Nuova spesa (2 campi + preset importi, categoria dedotta live) · `/spese` Registro con
filtri e cambio categoria inline · `/km` · `/carburante` · `/analisi` (categorie/trend/dashboard,
drill-down per categoria) · `/importa` (parser testo libero con anteprima e verifica totali).

## Seed
`cd /app/backend && python seed.py` importa `backend/data/spese_2026.txt`:
572 spese, gennaio→settembre 2026, km mensili e aiuti carburante inclusi.

## Extra (v2)
- Abbonamenti fissi modificabili inline dalla pagina Carburante (aggiungi/rimuovi voci, PUT /subscriptions).
- Apprendimento categorie: correggendo a mano una categoria nel Registro compare un dialog che
  propone di salvare la parola chiave (POST /categories/rules) usata poi in auto-categorizzazione.
- Export CSV delle spese filtrate dal Registro (client-side, separatore `;`, decimali con virgola, BOM UTF-8).
- Parole viaggio ("roma","praga","hotel","volo","viaggio","gita","vacanza"…) → categoria Eventi & Vacanze.
- **Totale manuale del mese** (collection `month_overrides`): GET/PUT `/overrides/{mese}`, GET `/overrides`.
  Se impostato forza il totale del mese in summary/dashboard/trend (flag `manuale`); azzerarlo
  (totale_manuale=null) ripristina la somma automatica. AnalyticsSummary espone `totale`,
  `totale_spese`, `totale_manuale`. Pannello UI in Analisi (scope mese). Es. impostato: 2025-09 = 800€.

## Categorie dinamiche (v4)
- Le categorie ora vivono nella collection `categories` (seed idempotente dai built-in in
  `lib.categorize.CATEGORIE`; doc: key immutabile, nome editabile, builtin, order; Varie order 9999).
- Endpoint: GET `/categories` (lista nomi), POST `/categories` {nome} (crea, no duplicati),
  PATCH `/categories` {old,new} (rinomina → aggiorna anche expenses.categoria e keyword_rules;
  NIENTE eliminazione, scelta utente). `add_rule` valida sui nomi dinamici.
- `create_expense`: il risultato dell'auto-categorizzazione (nome canonico) viene mappato sul nome
  visualizzato corrente via `display_for` (così i rinomini dei built-in si riflettono sulle nuove spese).
- Frontend: nuova pagina `/categorie` (nav "Categorie") con crea + rinomina inline; nav mobile a 7 col.

## Categorie persona (v3)
- "Regali & Giulia" separata in tre: **Regali** (regalo/fiori/pandora…), **Giulia** (qualunque voce
  con "giulia" o tag persona giulia — priorità massima nel motore) e **Lety** (lety/leti).
- Riassegnate le voci storiche: Giulia 99, Lety 7, Regali 19. Colori dedicati in `CATEGORY_COLORS`.
- Valencia/Brasile/Pietra spostate in Eventi & Vacanze (oltre a Roma/Praga).
- Registro: modifica inline di **data, importo, motivo** di una spesa (dialog `edit-dialog`,
  PATCH /expenses/{id}) oltre a categoria ed eliminazione.

## Dati storici 2025
Importati da `backend/data/spese_2025.txt` con `python import_2025.py` (idempotente, formato a
settimane). 723 voci gen–dic 2025. Regole applicate: intestazioni settimana e righe di
somma/calcolo (`-->`, aritmetiche, `tot:` per-settimana) ignorate; righe di solo importo (totale
mese) scartate; km dicembre 2025 (130942→134300). Ogni mese ha il **totale manuale dichiarato**
(month_overrides): Gen 717,7 · Feb 724 · Mar 1023,3 · Apr 845,5 · Mag 880 · Giu 622 · Lug 981 ·
Ago 230 · Set 800 · Ott 764,70 · Nov 915,9 · Dic 844,36. Roma/Praga in Eventi & Vacanze;
Valencia/Brasile/Pietra restano in Varie (ritaggabili a mano). Le somme delle singole righe
possono differire leggermente dal totale dichiarato: per questo il totale mese usa l'override.

## Deviazione nota
Il file sorgente non riporta il giorno delle singole spese: le righe importate vengono
distribuite in ordine sui giorni del mese e marcate `data_stimata=true`. La heatmap per
giorno della settimana sui dati importati è quindi indicativa.

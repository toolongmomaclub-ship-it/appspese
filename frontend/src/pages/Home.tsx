import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Panel, Stat } from "@/components/Panel";
import { apiGet, apiPost } from "@/lib/api";
import {
  colorFor,
  dataLabel,
  eur,
  type AnalyticsSummary,
  type CategorizeHint,
  type Expense,
} from "@/lib/types";

const PRESETS = [
  { label: "5.8", importo: 5.8, motivo: "Siga" },
  { label: "50", importo: 50, motivo: "Lety" },
  { label: "28", importo: 28, motivo: "Abbonamenti" },
];

function formatPresetAmount(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  const qc = useQueryClient();
  const [importo, setImporto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(todayIso());

  const hint = useQuery({
    queryKey: ["categorize", motivo],
    queryFn: () => apiGet<CategorizeHint>(`/categorize?motivo=${encodeURIComponent(motivo)}`),
    enabled: motivo.trim().length > 1,
  });

  const summary = useQuery({
    queryKey: ["summary", "mese-corrente"],
    queryFn: () => apiGet<AnalyticsSummary>("/analytics/summary"),
  });

  const recenti = useQuery({
    queryKey: ["expenses", "recenti"],
    queryFn: () => apiGet<Expense[]>("/expenses"),
    select: (rows) => rows.slice(0, 8),
  });

  const salva = useMutation({
    mutationFn: () =>
      apiPost<Expense>("/expenses", {
        importo: Number(importo.replace(",", ".")),
        motivo: motivo.trim(),
        data,
      }),
    onSuccess: (e) => {
      toast.success(`Salvato ${eur(e.importo)} · ${e.categoria}`);
      setImporto("");
      setMotivo("");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["fuel"] });
    },
    onError: () => toast.error("Impossibile salvare la spesa"),
  });

  const valido = Number(importo.replace(",", ".")) > 0 && motivo.trim().length > 0;
  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Nuova spesa</h1>
        <p className="mt-1 text-sm text-slate-400">
          Due campi, un tap. La categoria viene dedotta in automatico.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel testid="quick-add-panel" className="rise lg:col-span-7">
          <form
            data-testid="quick-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (valido) salva.mutate();
            }}
            className="space-y-5"
          >
            <div>
              <Label className="label-xs" htmlFor="amount-input">
                Importo
              </Label>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#223142] bg-[#0E151D] px-4 py-3 focus-within:border-sky-500 transition-colors duration-150">
                <span className="num text-3xl text-slate-500">€</span>
                <input
                  id="amount-input"
                  data-testid="amount-input"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={importo}
                  onChange={(e) => setImporto(e.target.value)}
                  className="num w-full bg-transparent text-4xl font-semibold text-white outline-none placeholder:text-slate-700"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    data-testid={`preset-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => {
                      setImporto(formatPresetAmount(p.importo));
                      setMotivo(p.motivo);
                    }}
                    className="num rounded-lg border border-[#223142] bg-[#16202B] px-3 py-1.5 text-sm text-slate-300 transition-colors duration-150 hover:border-sky-600 hover:text-white active:scale-[0.98]"
                  >
                    {p.label} {formatPresetAmount(p.importo)}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="preset-clear"
                  onClick={() => setImporto("")}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors duration-150 hover:text-slate-300"
                >
                  azzera
                </button>
              </div>
            </div>

            <div>
              <Label className="label-xs" htmlFor="motive-input">
                Motivo
              </Label>
              <Input
                id="motive-input"
                data-testid="motive-input"
                placeholder="es. benza, siga, caffè, fiori giulia"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="mt-2 h-12 border-[#223142] bg-[#0E151D] text-base"
              />
              {hint.data ? (
                <div className="mt-2 flex items-center gap-2" data-testid="category-hint">
                  <Badge
                    className="border-0 text-white"
                    style={{ backgroundColor: colorFor(hint.data.categoria) }}
                  >
                    {hint.data.categoria}
                  </Badge>
                  {hint.data.tag_persona ? (
                    <Badge variant="outline" data-testid="person-hint">
                      {hint.data.tag_persona}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <Label className="label-xs" htmlFor="date-input">
                Data
              </Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  id="date-input"
                  data-testid="date-input"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-11 w-auto border-[#223142] bg-[#0E151D]"
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="date-today-btn"
                  onClick={() => setData(todayIso())}
                >
                  Oggi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="date-yesterday-btn"
                  onClick={() => setData(yesterdayIso())}
                >
                  Ieri
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="save-expense-btn"
              disabled={!valido || salva.isPending}
              className="h-14 w-full bg-sky-600 text-base font-semibold text-white transition-transform duration-150 hover:bg-sky-500 active:scale-[0.98]"
            >
              {salva.isPending ? "Salvataggio…" : "Salva spesa"}
            </Button>
          </form>
        </Panel>

        <div className="grid gap-4 lg:col-span-5">
          <div className="grid grid-cols-2 gap-4">
            <Stat
              testid="stat-month-total"
              label="Totale mese"
              value={eur(s?.totale ?? 0)}
              accent="#38BDF8"
              sub={s ? `${s.conteggio} voci` : undefined}
            />
            <Stat
              testid="stat-daily-avg"
              label="Media / giorno"
              value={eur(s?.media_giornaliera ?? 0)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              testid="stat-projection"
              label="Proiezione fine mese"
              value={eur(s?.proiezione_fine_mese ?? 0)}
              accent="#FBBF24"
            />
            <Stat
              testid="stat-variation"
              label="Vs mese scorso"
              value={s?.variazione_pct === null || s?.variazione_pct === undefined
                ? "—"
                : `${s.variazione_pct > 0 ? "+" : ""}${s.variazione_pct}%`}
              accent={(s?.variazione_pct ?? 0) > 0 ? "#F87171" : "#34D399"}
              sub={s ? `prec. ${eur(s.totale_precedente)}` : undefined}
            />
          </div>

          <Panel testid="recent-panel">
            <div className="label-xs mb-3">Ultime spese</div>
            {recenti.data && recenti.data.length > 0 ? (
              <ul className="space-y-2" data-testid="recent-list">
                {recenti.data.map((e) => (
                  <li
                    key={e.id}
                    data-testid="recent-item"
                    className="flex items-center justify-between gap-3 border-b border-[#1A2532] pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-200">{e.motivo}</div>
                      <div className="num text-[11px] text-slate-500">
                        {dataLabel(e.data)} · {e.categoria}
                      </div>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold">{eur(e.importo)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nessuna spesa ancora registrata.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

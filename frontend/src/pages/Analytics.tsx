import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel, Stat, Empty } from "@/components/Panel";
import { apiGet, apiPut } from "@/lib/api";
import {
  colorFor,
  dataLabel,
  eur,
  MESI_IT,
  meseLabel,
  num,
  type AnalyticsSummary,
  type Dashboard,
  type Expense,
  type MonthOverride,
  type MonthPoint,
} from "@/lib/types";

const TOOLTIP = {
  background: "#131B24",
  border: "1px solid #223142",
  borderRadius: 8,
  color: "#F1F5F9",
};

export default function Analytics() {
  const annoCorrente = new Date().getFullYear();
  const [anno, setAnno] = useState(String(annoCorrente));
  const [mese, setMese] = useState<string>(new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState<"mese" | "anno">("mese");
  const [drill, setDrill] = useState<string | null>(null);
  const qc = useQueryClient();
  const [manualDraft, setManualDraft] = useState("");
  const [selCat, setSelCat] = useState("Bar & Cibo");

  const anni = [annoCorrente, annoCorrente - 1, annoCorrente - 2].map(String);

  const summary = useQuery({
    queryKey: ["summary", scope, scope === "mese" ? mese : anno],
    queryFn: () =>
      apiGet<AnalyticsSummary>(
        scope === "mese" ? `/analytics/summary?mese=${mese}` : `/analytics/summary?anno=${anno}`,
      ),
  });

  const dash = useQuery({
    queryKey: ["dashboard", anno],
    queryFn: () => apiGet<Dashboard>(`/analytics/dashboard?anno=${anno}`),
  });

  const categorie = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<string[]>("/categories"),
  });

  const catTrend = useQuery({
    queryKey: ["category-trend", anno, selCat],
    queryFn: () =>
      apiGet<MonthPoint[]>(
        `/analytics/category-trend?anno=${anno}&categoria=${encodeURIComponent(selCat)}`,
      ),
  });

  const drillRows = useQuery({
    queryKey: ["expenses", "drill", drill, scope, mese, anno],
    queryFn: () =>
      apiGet<Expense[]>(
        `/expenses?categoria=${encodeURIComponent(drill ?? "")}&${
          scope === "mese" ? `mese=${mese}` : `anno=${anno}`
        }`,
      ),
    enabled: drill !== null,
  });

  const override = useQuery({
    queryKey: ["override", mese],
    queryFn: () => apiGet<MonthOverride>(`/overrides/${mese}`),
    enabled: scope === "mese",
  });

  useEffect(() => {
    setManualDraft(
      override.data?.totale_manuale != null ? String(override.data.totale_manuale) : "",
    );
  }, [override.data, mese]);

  const setOverride = useMutation({
    mutationFn: (val: string | null) =>
      apiPut<MonthOverride>(`/overrides/${mese}`, {
        totale_manuale:
          val === null || val.trim() === "" ? null : Number(val.replace(",", ".")),
      }),
    onSuccess: (o) => {
      toast.success(
        o.totale_manuale != null
          ? `Totale ${meseLabel(mese)} forzato a ${eur(o.totale_manuale)}`
          : "Totale automatico ripristinato",
      );
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["override"] });
    },
    onError: () => toast.error("Valore non valido"),
  });

  const s = summary.data;
  const d = dash.data;
  const mesiOpts = MESI_IT.map((_, i) => `${anno}-${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Analisi & Trend</h1>
          <p className="mt-1 text-sm text-slate-400">
            Totali ricalcolati in tempo reale sulle spese registrate.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={anno} onValueChange={(v: string) => { setAnno(v); setMese(`${v}-${mese.slice(5)}`); }}>
            <SelectTrigger className="w-28" data-testid="filter-year-select">
              <SelectValue>{(v) => v as string}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {anni.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v: string) => setScope(v as "mese" | "anno")}>
            <SelectTrigger className="w-32" data-testid="filter-scope-select">
              <SelectValue>{(v) => (v === "mese" ? "Per mese" : "Per anno")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mese">Per mese</SelectItem>
              <SelectItem value="anno">Per anno</SelectItem>
            </SelectContent>
          </Select>
          {scope === "mese" ? (
            <Select value={mese} onValueChange={(v: string) => setMese(v)}>
              <SelectTrigger className="w-44" data-testid="filter-month-select">
                <SelectValue>{(v) => meseLabel(v as string)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {mesiOpts.map((m) => (
                  <SelectItem key={m} value={m}>{meseLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          testid="analytics-total"
          label={`Totale ${scope === "mese" ? "mese" : "anno"}`}
          value={eur(s?.totale ?? 0)}
          accent="#38BDF8"
          sub={
            s?.totale_manuale != null
              ? `manuale · spese reali ${eur(s.totale_spese)}`
              : s
                ? `${s.conteggio} voci`
                : undefined
          }
        />
        <Stat
          testid="analytics-daily"
          label="Media giornaliera"
          value={eur(s?.media_giornaliera ?? 0)}
        />
        <Stat
          testid="analytics-variation"
          label={scope === "mese" ? "Vs mese precedente" : "Vs anno precedente"}
          value={
            s?.variazione_pct === null || s?.variazione_pct === undefined
              ? "—"
              : `${s.variazione_pct > 0 ? "+" : ""}${s.variazione_pct}%`
          }
          accent={(s?.variazione_pct ?? 0) > 0 ? "#F87171" : "#34D399"}
          sub={s ? `prec. ${eur(s.totale_precedente)}` : undefined}
        />
        <Stat
          testid="analytics-projection"
          label={scope === "mese" ? "Proiezione fine mese" : "Km percorsi anno"}
          value={
            scope === "mese"
              ? eur(s?.proiezione_fine_mese ?? 0)
              : `${num(d?.km_anno ?? 0)} km`
          }
          accent="#FBBF24"
        />
      </div>

      {scope === "mese" ? (
        <Panel testid="manual-total-panel" className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <div className="label-xs flex items-center gap-2">
              Totale manuale del mese
              {s?.totale_manuale != null ? (
                <Badge className="border-0 bg-sky-700 text-white" data-testid="manual-total-badge">
                  attivo
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Forza un totale per {meseLabel(mese)} (utile per un mese importato senza dettaglio
              spese). Somma reale delle spese: {eur(s?.totale_spese ?? 0)}. Azzera per tornare al
              calcolo automatico.
            </p>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <Input
              data-testid="manual-total-input"
              inputMode="decimal"
              placeholder="es. 800"
              value={manualDraft}
              onChange={(e) => setManualDraft(e.target.value)}
              className="num h-11 w-32 border-[#223142] bg-[#0E151D]"
            />
            <Button
              data-testid="manual-total-save-btn"
              onClick={() => setOverride.mutate(manualDraft)}
              disabled={setOverride.isPending || manualDraft.trim() === ""}
              className="h-11 bg-sky-600 text-white transition-transform duration-150 hover:bg-sky-500 active:scale-[0.98]"
            >
              Forza totale
            </Button>
            <Button
              variant="outline"
              data-testid="manual-total-clear-btn"
              onClick={() => setOverride.mutate(null)}
              disabled={setOverride.isPending || s?.totale_manuale == null}
              className="h-11"
            >
              Usa somma spese
            </Button>
          </div>
        </Panel>
      ) : null}

      <Tabs defaultValue="categorie">
        <TabsList variant="line" data-testid="analytics-tabs">
          <TabsTrigger value="categorie" data-testid="tab-categorie">Categorie</TabsTrigger>
          <TabsTrigger value="trend" data-testid="tab-trend">Trend</TabsTrigger>
          <TabsTrigger value="categoria" data-testid="tab-categoria">Per categoria</TabsTrigger>
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="categorie" className="mt-5">
          <div className="grid gap-6 lg:grid-cols-12">
            <Panel testid="pie-panel" className="lg:col-span-5">
              <div className="label-xs mb-4">Ripartizione per categoria</div>
              {(s?.categorie ?? []).length === 0 ? (
                <Empty text="Nessun dato nel periodo." testid="pie-empty" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={s?.categorie ?? []}
                      dataKey="totale"
                      nameKey="categoria"
                      innerRadius={65}
                      outerRadius={110}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(s?.categorie ?? []).map((c) => (
                        <Cell key={c.categoria} fill={colorFor(c.categoria)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP}
                      formatter={(value: number, name: string) => [eur(value), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
            <Panel testid="category-list-panel" className="lg:col-span-7">
              <div className="label-xs mb-4">Dettaglio — clicca per il drill-down</div>
              <ul className="space-y-1" data-testid="category-list">
                {(s?.categorie ?? []).map((c) => (
                  <li key={c.categoria}>
                    <button
                      data-testid="category-drill-btn"
                      onClick={() => setDrill(c.categoria)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#1A2532]"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor(c.categoria) }}
                      />
                      <span className="flex-1 text-sm text-slate-200">{c.categoria}</span>
                      <span className="num text-xs text-slate-500">{c.conteggio}×</span>
                      <span className="num w-16 text-right text-xs text-slate-400">
                        {c.percentuale}%
                      </span>
                      <span className="num w-24 text-right text-sm font-semibold">
                        {eur(c.totale)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="trend" className="mt-5">
          <Panel testid="trend-panel">
            <div className="label-xs mb-4">Spesa mensile {anno}</div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={(d?.trend ?? []).map((p) => ({ ...p, label: MESI_IT[Number(p.mese.slice(5)) - 1].slice(0, 3) }))}>
                <CartesianGrid stroke="#1A2532" vertical={false} />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP}
                  formatter={(value: number) => [eur(value), "Totale"]}
                />
                <Line
                  type="monotone"
                  dataKey="totale"
                  stroke="#38BDF8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#0284C7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </TabsContent>

        <TabsContent value="categoria" className="mt-5">
          <Panel testid="category-trend-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="label-xs">Andamento mensile per categoria — {anno}</div>
              <Select value={selCat} onValueChange={(v: string) => setSelCat(v)}>
                <SelectTrigger className="w-56" data-testid="category-trend-select">
                  <span
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ backgroundColor: colorFor(selCat) }}
                  />
                  <SelectValue>{(v) => v as string}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(categorie.data ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className="num mb-4 text-2xl font-semibold"
              style={{ color: colorFor(selCat) }}
              data-testid="category-trend-total"
            >
              {eur((catTrend.data ?? []).reduce((a, p) => a + p.totale, 0))}
              <span className="ml-2 text-xs font-normal text-slate-500">totale {anno}</span>
            </div>
            {(catTrend.data ?? []).every((p) => p.totale === 0) ? (
              <Empty
                text="Nessuna spesa per questa categoria nell'anno selezionato."
                testid="category-trend-empty"
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={(catTrend.data ?? []).map((p) => ({
                    ...p,
                    label: MESI_IT[Number(p.mese.slice(5)) - 1].slice(0, 3),
                  }))}
                >
                  <CartesianGrid stroke="#1A2532" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP}
                    formatter={(value: number) => [eur(value), selCat]}
                  />
                  <Line
                    type="monotone"
                    dataKey="totale"
                    stroke={colorFor(selCat)}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-5">
          <div className="grid gap-6 lg:grid-cols-12">
            <Panel testid="weekday-panel" className="lg:col-span-6">
              <div className="label-xs mb-4">Spesa media per giorno della settimana</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d?.weekday ?? []}>
                  <CartesianGrid stroke="#1A2532" vertical={false} />
                  <XAxis dataKey="giorno" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP}
                    formatter={(value: number) => [eur(value), "Media"]}
                  />
                  <Bar dataKey="media" fill="#34D399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel testid="eurokm-panel" className="lg:col-span-6">
              <div className="label-xs mb-4">Costo carburante per km</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={(d?.euro_per_km ?? []).map((p) => ({ ...p, label: MESI_IT[Number(p.mese.slice(5)) - 1].slice(0, 3) }))}>
                  <CartesianGrid stroke="#1A2532" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP}
                    formatter={(value: number) => [`${value.toFixed(3)} €/km`, "Costo"]}
                  />
                  <Line type="monotone" dataKey="totale" stroke="#F97316" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel testid="top-motivi-importo" className="lg:col-span-6">
              <div className="label-xs mb-3">Top 5 motivi per importo</div>
              <ul className="space-y-2" data-testid="top-motivi-importo-list">
                {(d?.top_motivi_importo ?? []).map((m) => (
                  <li key={m.motivo} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-200">{m.motivo}</span>
                    <span className="num font-semibold">{eur(m.totale)}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel testid="top-motivi-frequenza" className="lg:col-span-6">
              <div className="label-xs mb-3">Top 5 motivi per frequenza</div>
              <ul className="space-y-2" data-testid="top-motivi-frequenza-list">
                {(d?.top_motivi_frequenza ?? []).map((m) => (
                  <li key={m.motivo} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-200">{m.motivo}</span>
                    <Badge variant="secondary" className="num">{m.conteggio}×</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={drill !== null} onOpenChange={(o: boolean) => !o && setDrill(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl" data-testid="drill-dialog">
          <DialogHeader>
            <DialogTitle>{drill}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500" data-testid="drill-subtitle">
            Spese che compongono la categoria — {(drillRows.data ?? []).length} voci ·{" "}
            {eur((drillRows.data ?? []).reduce((a, e) => a + e.importo, 0))}
          </p>
          <div className="label-xs flex items-center gap-2 border-b border-[#223142] pb-2">
            <span className="w-20">Data</span>
            <span className="flex-1 px-4">Descrizione</span>
            <span>Importo</span>
          </div>
          <ul className="space-y-2" data-testid="drill-list">
            {(drillRows.data ?? []).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between border-b border-[#1A2532] pb-2 text-sm"
              >
                <span className="num text-xs text-slate-500">{dataLabel(e.data)}</span>
                <span className="flex-1 px-4 text-slate-200">{e.motivo}</span>
                <span className="num font-semibold">{eur(e.importo)}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

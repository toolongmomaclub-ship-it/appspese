import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch } from "@/lib/api";
import { eur, type BudgetCategory } from "@/lib/types";

export default function BudgetPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const budgetQuery = useQuery({
    queryKey: ["budget", "categories"],
    queryFn: () => apiGet<BudgetCategory[]>("/budget/categories"),
  });

  const updateBudget = useMutation({
    mutationFn: ({ nome, value }: { nome: string; value: number | null }) =>
      apiPatch<BudgetCategory>(`/budget/categories/${encodeURIComponent(nome)}`, {
        budget_mensile: value,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["budget"] });
    },
  });

  const rows = useMemo(() => {
    const list = budgetQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((item) => item.nome.toLowerCase().includes(q)) : list;
  }, [budgetQuery.data, search]);

  const totals = useMemo(() => {
    const totalBudget = rows.reduce((sum, item) => sum + (item.budget_mensile ?? 0), 0);
    const totalSpeso = rows.reduce((sum, item) => sum + item.totale_speso, 0);
    const remaining = totalBudget - totalSpeso;
    return { totalBudget, totalSpeso, remaining };
  }, [rows]);

  const saveBudget = (name: string) => {
    const raw = (drafts[name] ?? "").replace(".", ",").trim();
    if (raw === "") {
      updateBudget.mutate({ nome: name, value: null });
      return;
    }

    const parsed = Number(raw.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    updateBudget.mutate({ nome: name, value: parsed });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Budget mensile</h1>
          <p className="mt-1 text-sm text-slate-400">
            Definisci il massimo spesa per categoria e controlla il saldo del mese.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca categoria"
            className="h-11 border-[#223142] bg-[#0E151D]"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel testid="budget-total-budget" className="rise">
          <div className="label-xs">Budget totale</div>
          <div className="num mt-2 text-2xl font-semibold text-sky-400">{eur(totals.totalBudget)}</div>
        </Panel>
        <Panel testid="budget-total-spent" className="rise">
          <div className="label-xs">Speso</div>
          <div className="num mt-2 text-2xl font-semibold text-amber-400">{eur(totals.totalSpeso)}</div>
        </Panel>
        <Panel testid="budget-total-remaining" className="rise">
          <div className="label-xs">Rimanente</div>
          <div className="num mt-2 text-2xl font-semibold text-emerald-400">{eur(totals.remaining)}</div>
        </Panel>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <Panel>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Wallet className="size-4" /> Nessuna categoria trovata
            </div>
          </Panel>
        ) : null}

        {rows.map((item) => {
          const draftValue =
            drafts[item.nome] ?? (item.budget_mensile == null ? "" : String(item.budget_mensile));
          const percent = item.budget_mensile && item.budget_mensile > 0 ? item.percentuale : 0;
          const barColor = item.rimanente !== null && item.rimanente < 0 ? "bg-rose-500" : "bg-sky-500";

          return (
            <Panel key={item.nome} testid="budget-category-row" className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{item.nome}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Speso: {eur(item.totale_speso)}</span>
                    <span>•</span>
                    <span>Rimanente: {item.rimanente === null ? "nessuno" : eur(item.rimanente)}</span>
                  </div>
                </div>

                <div className="flex w-full max-w-md items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={draftValue}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.nome]: e.target.value,
                      }))
                    }
                    placeholder="Budget mensile"
                    className="h-11 border-[#223142] bg-[#0E151D]"
                  />
                  <Button
                    onClick={() => saveBudget(item.nome)}
                    disabled={updateBudget.isPending}
                    className="h-11 bg-sky-600 text-white hover:bg-sky-500"
                  >
                    Salva
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{item.budget_mensile === null ? "Nessun budget impostato" : `Budget ${eur(item.budget_mensile)}`}</span>
                  <span>{Math.min(Math.max(percent, 0), 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#1A2532]">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
                  />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

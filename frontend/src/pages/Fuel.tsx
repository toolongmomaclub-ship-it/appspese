import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel, Stat, Empty } from "@/components/Panel";
import { apiGet, apiPut } from "@/lib/api";
import {
  dataLabel,
  eur,
  meseLabel,
  num,
  type Expense,
  type FuelSummary,
  type MonthlyKM,
  type SubscriptionItem,
  type Subscriptions,
} from "@/lib/types";

type SubRow = { id: string; nome: string; importo: string };

export default function Fuel() {
  const qc = useQueryClient();
  const [mese, setMese] = useState(() => new Date().toISOString().slice(0, 7));
  const [aiuto, setAiuto] = useState("0");
  const [editSubs, setEditSubs] = useState(false);
  const [voci, setVoci] = useState<SubRow[]>([]);

  const storico = useQuery({
    queryKey: ["km-list"],
    queryFn: () => apiGet<MonthlyKM[]>("/km"),
  });

  const fuel = useQuery({
    queryKey: ["fuel", mese],
    queryFn: () => apiGet<FuelSummary>(`/fuel/${mese}`),
  });

  const rifornimenti = useQuery({
    queryKey: ["expenses", "carburante", mese],
    queryFn: () => apiGet<Expense[]>(`/expenses?mese=${mese}&categoria=Carburante`),
  });

  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => apiGet<Subscriptions>("/subscriptions"),
  });

  useEffect(() => {
    if (fuel.data) setAiuto(String(fuel.data.aiuto_esterno));
  }, [fuel.data]);

  const salvaAiuto = useMutation({
    mutationFn: () =>
      apiPut<FuelSummary>(`/fuel/${mese}`, { aiuto_esterno: Number(aiuto.replace(",", ".")) || 0 }),
    onSuccess: () => {
      toast.success("Aiuto esterno aggiornato");
      void qc.invalidateQueries({ queryKey: ["fuel"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Valore non valido"),
  });

  const salvaSubs = useMutation({
    mutationFn: () =>
      apiPut<Subscriptions>("/subscriptions", {
        voci: voci
          .filter((v) => v.nome.trim())
          .map((v) => ({ nome: v.nome.trim(), importo: Number(v.importo.replace(",", ".")) || 0 })),
      }),
    onSuccess: () => {
      toast.success("Abbonamenti aggiornati");
      setEditSubs(false);
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: () => toast.error("Impossibile salvare gli abbonamenti"),
  });

  const opzioni = Array.from(
    new Set([mese, new Date().toISOString().slice(0, 7), ...(storico.data ?? []).map((k) => k.mese)]),
  )
    .sort()
    .reverse();

  const f = fuel.data;
  const totaleSubs = voci.reduce(
    (a, v) => a + (Number(v.importo.replace(",", ".")) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Carburante</h1>
        <p className="mt-1 text-sm text-slate-400">
          Totale automatico delle voci in categoria Carburante, al netto degli aiuti ricevuti.
        </p>
      </div>

      <Panel className="flex flex-wrap items-end gap-4" testid="fuel-controls">
        <div>
          <Label className="label-xs">Mese</Label>
          <Select value={mese} onValueChange={(v: string) => setMese(v)}>
            <SelectTrigger className="mt-2 w-48" data-testid="fuel-month-select">
              <SelectValue>{(v) => meseLabel(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {opzioni.map((m) => (
                <SelectItem key={m} value={m}>
                  {meseLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="label-xs" htmlFor="fuel-aid-input">
            Aiuto ricevuto (genitori/altri)
          </Label>
          <Input
            id="fuel-aid-input"
            data-testid="fuel-aid-input"
            inputMode="decimal"
            value={aiuto}
            onChange={(e) => setAiuto(e.target.value)}
            className="num mt-2 h-11 w-40 border-[#223142] bg-[#0E151D]"
          />
        </div>
        <Button
          data-testid="fuel-save-btn"
          onClick={() => salvaAiuto.mutate()}
          className="h-11 bg-orange-600 text-white transition-transform duration-150 hover:bg-orange-500 active:scale-[0.98]"
        >
          Applica
        </Button>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          testid="fuel-gross"
          label="Carburante lordo"
          value={eur(f?.totale_carburante_lordo ?? 0)}
          accent="#FB923C"
        />
        <Stat testid="fuel-aid" label="Aiuto esterno" value={eur(f?.aiuto_esterno ?? 0)} />
        <Stat
          testid="fuel-net"
          label="Spesa netta reale"
          value={eur(f?.totale_netto ?? 0)}
          accent="#34D399"
        />
        <Stat
          testid="fuel-eur-km"
          label="€ / km"
          value={f?.euro_per_km ? `${f.euro_per_km.toFixed(3)} €` : "—"}
          sub={f?.km_fatti ? `${num(f.km_fatti)} km nel mese` : "km del mese non inseriti"}
          accent="#38BDF8"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel testid="fuel-list-panel" className="lg:col-span-2">
          <div className="label-xs mb-3">Rifornimenti del mese</div>
          {(rifornimenti.data ?? []).length === 0 ? (
            <Empty text="Nessun rifornimento registrato in questo mese." testid="fuel-empty" />
          ) : (
            <ul className="space-y-2" data-testid="fuel-list">
              {(rifornimenti.data ?? []).map((e) => (
                <li
                  key={e.id}
                  data-testid="fuel-item"
                  className="flex items-center justify-between border-b border-[#1A2532] pb-2 text-sm last:border-0"
                >
                  <span className="num text-xs text-slate-500">{dataLabel(e.data)}</span>
                  <span className="flex-1 px-4 text-slate-200">{e.motivo}</span>
                  <span className="num font-semibold">{eur(e.importo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel testid="subs-panel">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-xs">Abbonamenti fissi mensili</span>
            {editSubs ? (
              <button
                data-testid="subs-cancel-btn"
                onClick={() => {
                  setEditSubs(false);
                  setVoci([]);
                }}
                className="text-xs text-slate-500 transition-colors duration-150 hover:text-slate-300"
              >
                Annulla
              </button>
            ) : (
              <button
                data-testid="subs-edit-btn"
                disabled={!subs.data}
                onClick={() => {
                  setVoci(
                    (subs.data?.voci ?? []).map((v) => ({
                      id: crypto.randomUUID(),
                      nome: v.nome,
                      importo: String(v.importo),
                    })),
                  );
                  setEditSubs(true);
                }}
                className="flex items-center gap-1 text-xs text-sky-400 transition-colors duration-150 hover:text-sky-300 disabled:opacity-40"
              >
                <Pencil className="size-3.5" /> Modifica
              </button>
            )}
          </div>

          {editSubs ? (
            <div className="space-y-2" data-testid="subs-editor">
              {voci.map((v) => (
                <div key={v.id} className="flex items-center gap-2" data-testid="subs-edit-row">
                  <Input
                    data-testid="subs-name-input"
                    value={v.nome}
                    placeholder="nome"
                    onChange={(e) =>
                      setVoci((cur) =>
                        cur.map((x) => (x.id === v.id ? { ...x, nome: e.target.value } : x)),
                      )
                    }
                    className="h-9 flex-1 border-[#223142] bg-[#0E151D] text-sm"
                  />
                  <Input
                    data-testid="subs-amount-input"
                    inputMode="decimal"
                    value={v.importo}
                    onChange={(e) =>
                      setVoci((cur) =>
                        cur.map((x) => (x.id === v.id ? { ...x, importo: e.target.value } : x)),
                      )
                    }
                    className="num h-9 w-20 border-[#223142] bg-[#0E151D] text-sm"
                  />
                  <button
                    data-testid="subs-remove-btn"
                    onClick={() => setVoci((cur) => cur.filter((x) => x.id !== v.id))}
                    className="rounded-md p-1.5 text-slate-600 transition-colors duration-150 hover:bg-[#2A1A1F] hover:text-red-400"
                    aria-label={`Rimuovi ${v.nome}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                data-testid="subs-add-btn"
                onClick={() =>
                  setVoci((cur) => [...cur, { id: crypto.randomUUID(), nome: "", importo: "" }])
                }
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[#223142] py-2 text-xs text-slate-400 transition-colors duration-150 hover:border-sky-600 hover:text-sky-300"
              >
                <Plus className="size-3.5" /> Aggiungi voce
              </button>
              <div className="flex items-center justify-between border-t border-[#223142] pt-3">
                <span className="num text-sm font-semibold text-violet-400" data-testid="subs-edit-total">
                  {eur(totaleSubs)}
                </span>
                <Button
                  data-testid="subs-save-btn"
                  onClick={() => salvaSubs.mutate()}
                  disabled={salvaSubs.isPending}
                  className="h-9 gap-1 bg-violet-600 text-white transition-transform duration-150 hover:bg-violet-500 active:scale-[0.98]"
                >
                  <Save className="size-4" /> Salva
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ul className="space-y-2" data-testid="subs-list">
                {(subs.data?.voci ?? []).map((v) => (
                  <li key={v.nome} className="flex justify-between text-sm">
                    <span className="text-slate-300">{v.nome}</span>
                    <span className="num">{eur(v.importo)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-[#223142] pt-3 text-sm font-semibold">
                <span>Totale</span>
                <span className="num text-violet-400" data-testid="subs-total">
                  {eur(subs.data?.totale ?? 0)}
                </span>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

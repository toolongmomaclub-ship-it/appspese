import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { meseLabel, num, type MonthlyKM } from "@/lib/types";

function mesiRecenti(extra: string[]): string[] {
  const oggi = new Date();
  const list: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return Array.from(new Set([...list, ...extra])).sort().reverse();
}

export default function Km() {
  const qc = useQueryClient();
  const [mese, setMese] = useState(() => new Date().toISOString().slice(0, 7));
  const [iniziali, setIniziali] = useState("");
  const [finali, setFinali] = useState("");

  const storico = useQuery({
    queryKey: ["km-list"],
    queryFn: () => apiGet<MonthlyKM[]>("/km"),
  });

  const corrente = useQuery({
    queryKey: ["km", mese],
    queryFn: () => apiGet<MonthlyKM>(`/km/${mese}`),
  });

  useEffect(() => {
    if (corrente.data) {
      setIniziali(corrente.data.km_iniziali?.toString() ?? "");
      setFinali(corrente.data.km_finali?.toString() ?? "");
    }
  }, [corrente.data]);

  const salva = useMutation({
    mutationFn: () =>
      apiPut<MonthlyKM>(`/km/${mese}`, {
        km_iniziali: iniziali ? Number(iniziali) : null,
        km_finali: finali ? Number(finali) : null,
      }),
    onSuccess: () => {
      toast.success("Km aggiornati");
      void qc.invalidateQueries({ queryKey: ["km"] });
      void qc.invalidateQueries({ queryKey: ["km-list"] });
      void qc.invalidateQueries({ queryKey: ["fuel"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("I km finali devono essere ≥ dei km iniziali"),
  });

  const fatti =
    iniziali && finali ? Number(finali) - Number(iniziali) : corrente.data?.km_fatti ?? null;

  const chart = (storico.data ?? [])
    .filter((k) => k.km_fatti !== null)
    .map((k) => ({ mese: meseLabel(k.mese).slice(0, 3), km: k.km_fatti ?? 0 }));

  const opzioni = mesiRecenti((storico.data ?? []).map((k) => k.mese));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Km & Auto</h1>
        <p className="mt-1 text-sm text-slate-400">
          Contachilometri mensile. I km iniziali si precompilano con i finali del mese precedente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel testid="km-form-panel" className="space-y-4 lg:col-span-5">
          <div>
            <Label className="label-xs">Mese</Label>
            <Select value={mese} onValueChange={(v: string) => setMese(v)}>
              <SelectTrigger className="mt-2 w-full" data-testid="km-month-select">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="label-xs" htmlFor="km-initial-input">
                Km iniziali
              </Label>
              <Input
                id="km-initial-input"
                data-testid="km-initial-input"
                inputMode="numeric"
                value={iniziali}
                onChange={(e) => setIniziali(e.target.value)}
                className="num mt-2 h-12 border-[#223142] bg-[#0E151D] text-lg"
              />
            </div>
            <div>
              <Label className="label-xs" htmlFor="km-final-input">
                Km finali
              </Label>
              <Input
                id="km-final-input"
                data-testid="km-final-input"
                inputMode="numeric"
                value={finali}
                onChange={(e) => setFinali(e.target.value)}
                className="num mt-2 h-12 border-[#223142] bg-[#0E151D] text-lg"
              />
            </div>
          </div>
          <div className="rounded-lg border border-[#223142] bg-[#0E151D] px-4 py-3">
            <div className="label-xs">Km fatti (calcolato)</div>
            <div className="num mt-1 text-3xl font-semibold text-sky-400" data-testid="km-delta">
              {fatti === null ? "—" : num(fatti)}
            </div>
          </div>
          <Button
            data-testid="km-save-btn"
            onClick={() => salva.mutate()}
            disabled={salva.isPending}
            className="h-12 w-full bg-sky-600 text-white transition-transform duration-150 hover:bg-sky-500 active:scale-[0.98]"
          >
            Salva km
          </Button>
        </Panel>

        <div className="space-y-4 lg:col-span-7">
          <div className="grid grid-cols-2 gap-4">
            <Stat
              testid="km-total"
              label="Km totali registrati"
              value={num(
                (storico.data ?? []).reduce((a, k) => a + (k.km_fatti ?? 0), 0),
              )}
            />
            <Stat
              testid="km-avg"
              label="Media km / mese"
              value={num(
                Math.round(
                  (storico.data ?? []).reduce((a, k) => a + (k.km_fatti ?? 0), 0) /
                    Math.max((storico.data ?? []).filter((k) => k.km_fatti).length, 1),
                ),
              )}
            />
          </div>
          <Panel testid="km-chart-panel">
            <div className="label-xs mb-4">Km per mese</div>
            {chart.length === 0 ? (
              <Empty text="Nessun dato km registrato." testid="km-chart-empty" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chart}>
                  <CartesianGrid stroke="#1A2532" vertical={false} />
                  <XAxis dataKey="mese" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#131B24",
                      border: "1px solid #223142",
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => [`${num(value)} km`, "Km fatti"]}
                  />
                  <Bar dataKey="km" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

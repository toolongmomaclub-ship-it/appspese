import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/Panel";
import { apiPost } from "@/lib/api";
import { colorFor, eur, num, type ImportPreview, type ImportResult } from "@/lib/types";

const ESEMPIO = `SPESE 2025

GENNAIO

km - 120000
km finali - 122500

15 benza
5.8 siga
1.3 caffè

tot: 22.10`;

export default function ImportPage() {
  const qc = useQueryClient();
  const [testo, setTesto] = useState("");
  const [anno, setAnno] = useState("2025");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const analizza = useMutation({
    mutationFn: () => apiPost<ImportPreview>("/import/preview", { testo, anno: Number(anno) }),
    onSuccess: (p) => {
      setPreview(p);
      toast.success(`${p.totale_righe} righe riconosciute in ${p.mesi.length} mesi`);
    },
    onError: () => toast.error("Nessun blocco mensile riconosciuto nel testo"),
  });

  const conferma = useMutation({
    mutationFn: () => apiPost<ImportResult>("/import/commit", { testo, anno: Number(anno) }),
    onSuccess: (r) => {
      toast.success(`${r.inserite} spese importate`);
      setPreview(null);
      setTesto("");
      void qc.invalidateQueries();
    },
    onError: () => toast.error("Import non riuscito"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Importa testo</h1>
        <p className="mt-1 text-sm text-slate-400">
          Incolla il formato libero già in uso (blocchi mensili con km e righe «importo motivo»).
          L'import sostituisce le spese dei mesi presenti nel testo.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel testid="import-form-panel" className="space-y-4 lg:col-span-5">
          <div className="flex items-end gap-3">
            <div>
              <Label className="label-xs" htmlFor="import-year-input">
                Anno di riferimento
              </Label>
              <Input
                id="import-year-input"
                data-testid="import-year-input"
                inputMode="numeric"
                value={anno}
                onChange={(e) => setAnno(e.target.value)}
                className="num mt-2 h-11 w-32 border-[#223142] bg-[#0E151D]"
              />
            </div>
            <Button
              variant="outline"
              data-testid="import-example-btn"
              onClick={() => setTesto(ESEMPIO)}
              className="h-11"
            >
              Esempio
            </Button>
          </div>
          <div>
            <Label className="label-xs" htmlFor="import-text-textarea">
              Testo da importare
            </Label>
            <Textarea
              id="import-text-textarea"
              data-testid="import-text-textarea"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={18}
              placeholder="Incolla qui il contenuto di SPESE 2025.txt…"
              className="num mt-2 border-[#223142] bg-[#0E151D] text-xs leading-relaxed"
            />
          </div>
          <div className="flex gap-3">
            <Button
              data-testid="import-parse-btn"
              onClick={() => analizza.mutate()}
              disabled={!testo.trim() || analizza.isPending}
              className="h-11 flex-1 bg-sky-600 text-white transition-transform duration-150 hover:bg-sky-500 active:scale-[0.98]"
            >
              Analizza
            </Button>
            <Button
              data-testid="import-save-btn"
              onClick={() => conferma.mutate()}
              disabled={!preview || conferma.isPending}
              className="h-11 flex-1 bg-emerald-600 text-white transition-transform duration-150 hover:bg-emerald-500 active:scale-[0.98]"
            >
              Conferma import
            </Button>
          </div>
        </Panel>

        <div className="space-y-4 lg:col-span-7">
          {preview === null ? (
            <Panel testid="import-preview-empty">
              <p className="text-sm text-slate-500">
                L'anteprima con mesi, km, categorie dedotte e verifica dei totali comparirà qui
                dopo «Analizza».
              </p>
            </Panel>
          ) : (
            <>
              {preview.warnings.length > 0 ? (
                <Panel testid="import-warnings" className="border-amber-700/50 bg-[#1F1A0E]">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
                    <AlertTriangle className="size-4" /> Verifiche incrociate
                  </div>
                  <ul className="space-y-1 text-xs text-amber-200/80">
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {preview.mesi.map((m) => (
                <Panel key={m.mese} testid="import-month-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{m.nome} {m.mese.slice(0, 4)}</h3>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary" className="num">{m.righe.length} righe</Badge>
                      {m.km_iniziali ? (
                        <Badge variant="outline" className="num">
                          km {num(m.km_iniziali)} → {num(m.km_finali)}
                        </Badge>
                      ) : null}
                      <Badge className="num border-0 bg-sky-700 text-white">
                        {eur(m.totale_calcolato)}
                      </Badge>
                    </div>
                  </div>
                  <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1" data-testid="import-row-list">
                    {m.righe.map((r, i) => (
                      <li
                        key={`${m.mese}-${i}`}
                        className="flex items-center gap-2 text-xs"
                        data-testid="import-row"
                      >
                        <span className="num w-20 shrink-0 text-right font-semibold">
                          {eur(r.importo)}
                        </span>
                        <span className="flex-1 truncate text-slate-300">{r.motivo}</span>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-white"
                          style={{ backgroundColor: colorFor(r.categoria) }}
                        >
                          {r.categoria}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel, Empty } from "@/components/Panel";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { colorFor, dataLabel, eur, meseLabel, type Expense } from "@/lib/types";

export function useMesiDisponibili(): string[] {
  const { data } = useQuery({
    queryKey: ["km-list"],
    queryFn: () => apiGet<{ mese: string }[]>("/km"),
  });
  const oggi = new Date().toISOString().slice(0, 7);
  const set = new Set<string>([oggi, ...(data ?? []).map((k) => k.mese)]);
  return Array.from(set).sort().reverse();
}

function suggestKeyword(motivo: string): string {
  const toks = motivo
    .toLowerCase()
    .replace(/[^a-zà-ù0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return toks.sort((a, b) => b.length - a.length)[0] ?? motivo.trim().toLowerCase();
}

function toCsv(rows: Expense[]): string {
  const head = ["data", "importo", "motivo", "categoria", "tag_persona", "note_extra"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      e.data,
      String(e.importo).replace(".", ","),
      esc(e.motivo),
      esc(e.categoria),
      esc(e.tag_persona ?? ""),
      esc(e.note_extra ?? ""),
    ].join(";"),
  );
  return [head.join(";"), ...lines].join("\n");
}

export default function Expenses() {
  const qc = useQueryClient();
  const mesi = useMesiDisponibili();
  const [mese, setMese] = useState<string>("tutti");
  const [categoria, setCategoria] = useState<string>("tutte");
  const [q, setQ] = useState("");
  const [learn, setLearn] = useState<{ parola: string; categoria: string } | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState({ data: "", importo: "", motivo: "" });

  const categorie = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<string[]>("/categories"),
  });

  const params = new URLSearchParams();
  if (mese !== "tutti") params.set("mese", mese);
  if (categoria !== "tutte") params.set("categoria", categoria);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();

  const spese = useQuery({
    queryKey: ["expenses", "list", qs],
    queryFn: () => apiGet<Expense[]>(`/expenses${qs ? `?${qs}` : ""}`),
  });

  const totale = useMemo(
    () => (spese.data ?? []).reduce((a, e) => a + e.importo, 0),
    [spese.data],
  );

  const cambiaCategoria = useMutation({
    mutationFn: (v: { id: string; categoria: string }) =>
      apiPatch<Expense>(`/expenses/${v.id}`, { categoria: v.categoria }),
    onSuccess: (e) => {
      toast.success("Categoria aggiornata");
      setLearn({ parola: suggestKeyword(e.motivo), categoria: e.categoria });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["fuel"] });
    },
  });

  const salvaRegola = useMutation({
    mutationFn: (v: { parola: string; categoria: string }) =>
      apiPost("/categories/rules", { parola: v.parola, categoria: v.categoria }),
    onSuccess: (_d, v) => {
      toast.success(`«${v.parola}» → ${v.categoria} appreso`);
      setLearn(null);
    },
    onError: () => toast.error("Impossibile salvare la regola"),
  });

  const elimina = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/expenses/${id}`),
    onSuccess: () => {
      toast.success("Spesa eliminata");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const salvaModifica = useMutation({
    mutationFn: (v: { id: string; data: string; importo: number; motivo: string }) =>
      apiPatch<Expense>(`/expenses/${v.id}`, { data: v.data, importo: v.importo, motivo: v.motivo }),
    onSuccess: () => {
      toast.success("Spesa aggiornata");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["fuel"] });
    },
    onError: () => toast.error("Modifica non riuscita"),
  });

  function openEdit(e: Expense) {
    setEditing(e);
    setDraft({ data: e.data, importo: String(e.importo), motivo: e.motivo });
  }

  function exportCsv() {
    const rows = spese.data ?? [];
    if (rows.length === 0) {
      toast.error("Nessuna spesa da esportare");
      return;
    }
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spese_${mese !== "tutti" ? mese : "tutte"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} spese esportate`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Registro spese</h1>
          <p className="mt-1 text-sm text-slate-400">
            {spese.data?.length ?? 0} voci · totale{" "}
            <span className="num text-sky-400" data-testid="expenses-total">
              {eur(totale)}
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          data-testid="export-csv-btn"
          onClick={exportCsv}
          className="gap-2"
        >
          <Download className="size-4" /> Esporta CSV
        </Button>
      </div>

      <Panel className="flex flex-wrap gap-3" testid="expenses-filters">
        <Select value={mese} onValueChange={(v: string) => setMese(v)}>
          <SelectTrigger className="w-44" data-testid="filter-month-select">
            <SelectValue>{(v) => (v === "tutti" ? "Tutti i mesi" : meseLabel(v as string))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i mesi</SelectItem>
            {mesi.map((m) => (
              <SelectItem key={m} value={m}>
                {meseLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoria} onValueChange={(v: string) => setCategoria(v)}>
          <SelectTrigger className="w-52" data-testid="filter-category-select">
            <SelectValue>{(v) => (v === "tutte" ? "Tutte le categorie" : (v as string))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le categorie</SelectItem>
            {(categorie.data ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          data-testid="filter-search-input"
          placeholder="Cerca motivo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-56 border-[#223142] bg-[#0E151D]"
        />
      </Panel>

      {spese.isError ? (
        <Empty text="Dati non disponibili al momento." testid="expenses-error" />
      ) : (spese.data ?? []).length === 0 ? (
        <Empty text="Nessuna spesa per questi filtri." testid="expenses-empty" />
      ) : (
        <div className="space-y-2" data-testid="expenses-list">
          {(spese.data ?? []).map((e) => (
            <Panel
              key={e.id}
              testid="expense-row"
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span className="num w-20 shrink-0 text-xs text-slate-500">{dataLabel(e.data)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{e.motivo}</span>
              {e.tag_persona ? (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {e.tag_persona}
                </Badge>
              ) : null}
              {e.note_extra ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {e.note_extra}
                </Badge>
              ) : null}
              <span
                className="num w-24 shrink-0 text-right text-sm font-semibold"
                data-testid="expense-amount"
              >
                {eur(e.importo)}
              </span>
              <Select
                value={e.categoria}
                onValueChange={(v: string) => cambiaCategoria.mutate({ id: e.id, categoria: v })}
              >
                <SelectTrigger
                  size="sm"
                  className="w-44 shrink-0"
                  data-testid="expense-category-select"
                >
                  <span
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ backgroundColor: colorFor(e.categoria) }}
                  />
                  <SelectValue>{(v) => (v as string) ?? e.categoria}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(categorie.data ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                data-testid="expense-edit-btn"
                onClick={() => openEdit(e)}
                className="shrink-0 rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-[#1A2532] hover:text-sky-400"
                aria-label={`Modifica ${e.motivo}`}
              >
                <Pencil className="size-4" />
              </button>
              <button
                data-testid="expense-delete-btn"
                onClick={() => elimina.mutate(e.id)}
                className="shrink-0 rounded-md p-2 text-slate-600 transition-colors duration-150 hover:bg-[#2A1A1F] hover:text-red-400"
                aria-label={`Elimina ${e.motivo}`}
              >
                <Trash2 className="size-4" />
              </button>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={learn !== null} onOpenChange={(o: boolean) => !o && setLearn(null)}>
        <DialogContent className="sm:max-w-md" data-testid="learn-dialog">
          <DialogHeader>
            <DialogTitle>Impara questa categoria?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            In futuro assegno automaticamente questa categoria alle spese che contengono la parola
            chiave:
          </p>
          <div className="flex items-center gap-3">
            <Input
              data-testid="learn-keyword-input"
              value={learn?.parola ?? ""}
              onChange={(e) => setLearn((cur) => (cur ? { ...cur, parola: e.target.value } : cur))}
              className="num border-[#223142] bg-[#0E151D]"
            />
            <span className="text-slate-500">→</span>
            <Badge
              className="shrink-0 border-0 text-white"
              style={{ backgroundColor: colorFor(learn?.categoria ?? "") }}
            >
              {learn?.categoria}
            </Badge>
          </div>
          <DialogFooter>
            <Button variant="ghost" data-testid="learn-skip-btn" onClick={() => setLearn(null)}>
              No, grazie
            </Button>
            <Button
              data-testid="learn-save-btn"
              onClick={() => learn && salvaRegola.mutate(learn)}
              disabled={!learn?.parola.trim() || salvaRegola.isPending}
              className="bg-sky-600 text-white hover:bg-sky-500"
            >
              Salva regola
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o: boolean) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md" data-testid="edit-dialog">
          <DialogHeader>
            <DialogTitle>Modifica spesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-xs" htmlFor="edit-data-input">Data</Label>
              <Input
                id="edit-data-input"
                data-testid="edit-data-input"
                type="date"
                value={draft.data}
                onChange={(e) => setDraft((d) => ({ ...d, data: e.target.value }))}
                className="mt-2 h-11 border-[#223142] bg-[#0E151D]"
              />
            </div>
            <div>
              <Label className="label-xs" htmlFor="edit-importo-input">Importo (€)</Label>
              <Input
                id="edit-importo-input"
                data-testid="edit-importo-input"
                inputMode="decimal"
                value={draft.importo}
                onChange={(e) => setDraft((d) => ({ ...d, importo: e.target.value }))}
                className="num mt-2 h-11 border-[#223142] bg-[#0E151D]"
              />
            </div>
            <div>
              <Label className="label-xs" htmlFor="edit-motivo-input">Motivo</Label>
              <Input
                id="edit-motivo-input"
                data-testid="edit-motivo-input"
                value={draft.motivo}
                onChange={(e) => setDraft((d) => ({ ...d, motivo: e.target.value }))}
                className="mt-2 h-11 border-[#223142] bg-[#0E151D]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" data-testid="edit-cancel-btn" onClick={() => setEditing(null)}>
              Annulla
            </Button>
            <Button
              data-testid="edit-save-btn"
              onClick={() =>
                editing &&
                salvaModifica.mutate({
                  id: editing.id,
                  data: draft.data,
                  importo: Number(draft.importo.replace(",", ".")),
                  motivo: draft.motivo.trim(),
                })
              }
              disabled={
                salvaModifica.isPending ||
                !draft.motivo.trim() ||
                !(Number(draft.importo.replace(",", ".")) > 0)
              }
              className="bg-sky-600 text-white hover:bg-sky-500"
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

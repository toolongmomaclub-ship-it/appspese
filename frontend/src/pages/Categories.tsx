import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/Panel";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { colorFor } from "@/lib/types";

export default function Categories() {
  const qc = useQueryClient();
  const [nuovo, setNuovo] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const categorie = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<string[]>("/categories"),
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["categories"] });
    void qc.invalidateQueries({ queryKey: ["expenses"] });
    void qc.invalidateQueries({ queryKey: ["summary"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const crea = useMutation({
    mutationFn: (nome: string) => apiPost<string[]>("/categories", { nome }),
    onSuccess: () => {
      toast.success("Categoria creata");
      setNuovo("");
      invalidate();
    },
    onError: () => toast.error("Nome non valido o già esistente"),
  });

  const rinomina = useMutation({
    mutationFn: (v: { old: string; nuovo: string }) =>
      apiPatch<string[]>("/categories", { old: v.old, new: v.nuovo }),
    onSuccess: () => {
      toast.success("Categoria rinominata");
      setEditing(null);
      invalidate();
    },
    onError: () => toast.error("Nome non valido o già esistente"),
  });

  const list = categorie.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Categorie</h1>
        <p className="mt-1 text-sm text-slate-400">
          Crea nuove categorie e rinomina quelle esistenti. Rinominando, tutte le spese in quella
          categoria seguono il nuovo nome.
        </p>
      </div>

      <Panel testid="category-create-panel">
        <Label className="label-xs" htmlFor="category-new-input">
          Nuova categoria
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="category-new-input"
            data-testid="category-new-input"
            placeholder="es. Palestra, Casa, Viaggi lavoro…"
            value={nuovo}
            onChange={(e) => setNuovo(e.target.value)}
            className="h-11 max-w-sm border-[#223142] bg-[#0E151D]"
          />
          <Button
            data-testid="category-create-btn"
            onClick={() => crea.mutate(nuovo.trim())}
            disabled={crea.isPending || nuovo.trim() === ""}
            className="h-11 gap-1 bg-sky-600 text-white transition-transform duration-150 hover:bg-sky-500 active:scale-[0.98]"
          >
            <Plus className="size-4" /> Aggiungi
          </Button>
        </div>
      </Panel>

      <div className="grid gap-2 sm:grid-cols-2" data-testid="category-list-manage">
        {list.map((c) => (
          <Panel key={c} testid="category-item" className="flex items-center gap-3 px-4 py-3">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(c) }}
            />
            {editing === c ? (
              <>
                <Input
                  data-testid="category-rename-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-9 flex-1 border-[#223142] bg-[#0E151D] text-sm"
                />
                <button
                  data-testid="category-rename-save-btn"
                  onClick={() => rinomina.mutate({ old: c, nuovo: draft.trim() })}
                  disabled={rinomina.isPending || draft.trim() === "" || draft.trim() === c}
                  className="rounded-md p-2 text-emerald-400 transition-colors duration-150 hover:bg-[#12251C] disabled:opacity-40"
                  aria-label="Salva nome"
                >
                  <Check className="size-4" />
                </button>
                <button
                  data-testid="category-rename-cancel-btn"
                  onClick={() => setEditing(null)}
                  className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-[#1A2532]"
                  aria-label="Annulla"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm text-slate-100">{c}</span>
                <button
                  data-testid="category-rename-btn"
                  onClick={() => {
                    setEditing(c);
                    setDraft(c);
                  }}
                  className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-[#1A2532] hover:text-sky-400"
                  aria-label={`Rinomina ${c}`}
                >
                  <Pencil className="size-4" />
                </button>
              </>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}

// Mirror 1:1 dei modelli Pydantic in backend/models/schemas.py

export interface Expense {
  id: string;
  data: string;
  mese: string;
  importo: number;
  motivo: string;
  categoria: string;
  categoria_manuale: boolean;
  tag_persona: string | null;
  note_extra: string | null;
  data_stimata: boolean;
}

export interface ExpenseCreate {
  data?: string | null;
  importo: number;
  motivo: string;
  categoria?: string | null;
  tag_persona?: string | null;
  note_extra?: string | null;
}

export interface MonthlyKM {
  mese: string;
  km_iniziali: number | null;
  km_finali: number | null;
  km_fatti: number | null;
}

export interface FuelSummary {
  mese: string;
  totale_carburante_lordo: number;
  aiuto_esterno: number;
  totale_netto: number;
  km_fatti: number | null;
  euro_per_km: number | null;
}

export interface SubscriptionItem {
  nome: string;
  importo: number;
}

export interface Subscriptions {
  voci: SubscriptionItem[];
  totale: number;
}

export interface CategoryTotal {
  categoria: string;
  totale: number;
  conteggio: number;
  percentuale: number;
}

export interface MonthPoint {
  mese: string;
  totale: number;
  manuale?: boolean;
}

export interface MonthOverride {
  mese: string;
  totale_manuale: number | null;
  totale_spese: number;
  totale_effettivo: number;
}

export interface MotivoTotal {
  motivo: string;
  totale: number;
  conteggio: number;
}

export interface WeekdayPoint {
  giorno: string;
  totale: number;
  media: number;
}

export interface AnalyticsSummary {
  periodo: string;
  totale: number;
  conteggio: number;
  media_giornaliera: number;
  totale_precedente: number;
  variazione_pct: number | null;
  categorie: CategoryTotal[];
  proiezione_fine_mese: number | null;
  totale_spese: number;
  totale_manuale: number | null;
}

export interface Dashboard {
  trend: MonthPoint[];
  top_categorie: CategoryTotal[];
  top_motivi_importo: MotivoTotal[];
  top_motivi_frequenza: MotivoTotal[];
  weekday: WeekdayPoint[];
  euro_per_km: MonthPoint[];
  totale_anno: number;
  totale_mese_corrente: number;
  proiezione_fine_mese: number;
  km_anno: number;
}

export interface ImportRow {
  data: string;
  importo: number;
  motivo: string;
  categoria: string;
  tag_persona: string | null;
  note_extra: string | null;
}

export interface ImportMonth {
  mese: string;
  nome: string;
  km_iniziali: number | null;
  km_finali: number | null;
  aiuto_esterno: number;
  totale_dichiarato: number | null;
  totale_calcolato: number;
  righe: ImportRow[];
}

export interface ImportPreview {
  anno: number;
  mesi: ImportMonth[];
  warnings: string[];
  totale_righe: number;
}

export interface ImportResult {
  inserite: number;
  mesi: string[];
  warnings: string[];
}

export interface CategorizeHint {
  categoria: string;
  tag_persona: string | null;
}

export interface BudgetCategory {
  nome: string;
  budget_mensile: number | null;
  totale_speso: number;
  rimanente: number | null;
  percentuale: number;
  mese: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Carburante: "#F97316",
  Sigarette: "#EAB308",
  Abbonamenti: "#8B5CF6",
  "Bar & Cibo": "#06B6D4",
  Regali: "#F472B6",
  Giulia: "#EC4899",
  Lety: "#A78BFA",
  Gioco: "#F43F5E",
  Trasporti: "#6366F1",
  Rate: "#0EA5E9",
  Salute: "#14B8A6",
  Multe: "#DC2626",
  "Eventi & Vacanze": "#10B981",
  Risparmio: "#84CC16",
  Varie: "#94A3B8",
};

export const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function eur(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("it-IT").format(n);
}

export function meseLabel(mese: string): string {
  const [y, m] = mese.split("-");
  return `${MESI_IT[Number(m) - 1]} ${y}`;
}

export function dataLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function colorFor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#94A3B8";
}

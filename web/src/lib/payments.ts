import "server-only";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type Occurrence = {
  id: string;
  rule_id: string | null;
  due_date: string;
  concept: string;
  kind: "regular" | "card_payment";
  category_id: string | null;
  card_account_id: string | null;
  responsible_id: string | null;
  label_id: string | null;
  expected_cents: number | null;
  is_estimate: boolean;
  status: "pending" | "paid" | "cancelled";
  transaction_id: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type Rule = {
  id: string;
  concept: string;
  kind: "regular" | "card_payment";
  category_id: string | null;
  card_account_id: string | null;
  responsible_id: string | null;
  label_id: string | null;
  expected_cents: number | null;
  is_estimate: boolean;
  frequency: "weekly" | "monthly" | "yearly" | "every_n_days";
  weekdays: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  interval_days: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
};

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function describeRule(r: Pick<Rule, "frequency" | "weekdays" | "day_of_month" | "month_of_year" | "interval_days">): string {
  switch (r.frequency) {
    case "weekly":
      return `Cada semana: ${(r.weekdays ?? []).map((d) => WEEKDAYS[d].toLowerCase()).join(" y ")}`;
    case "monthly":
      return `Cada mes, el día ${r.day_of_month} (o el último del mes)`;
    case "yearly":
      return `Cada año, el ${r.day_of_month} de ${MONTHS[(r.month_of_year ?? 1) - 1]}`;
    case "every_n_days":
      return `Cada ${r.interval_days} días`;
  }
}

/** Materializa los vencimientos de las reglas activas (idempotente). */
export async function ensureOccurrences(supabase: Client) {
  await supabase.rpc("generate_occurrences");
}

export const OCCURRENCE_FIELDS =
  "id, rule_id, due_date, concept, kind, category_id, card_account_id, responsible_id, label_id, expected_cents, is_estimate, status, transaction_id, cancel_reason, notes, created_by, updated_by, updated_at";

export function statusLabel(o: Pick<Occurrence, "status" | "due_date">, today: string): { text: string; tone: string } {
  if (o.status === "paid") return { text: "Pagado", tone: "ok" };
  if (o.status === "cancelled") return { text: "Cancelado", tone: "" };
  if (o.due_date < today) return { text: "Vencido", tone: "critical" };
  if (o.due_date === today) return { text: "Hoy", tone: "warn" };
  return { text: "Pendiente", tone: "" };
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

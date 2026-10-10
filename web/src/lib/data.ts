import "server-only";
import type { createClient } from "./supabase/server";
import type { AccountType, TxKind } from "./labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AccountBalance = {
  account_id: string;
  name: string;
  type: AccountType;
  institution_id: string | null;
  institution_name: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  available_for_payments: boolean;
  archived: boolean;
  has_opening: boolean;
  start_date: string | null;
  balance_cents: number;
};

export type Catalog = { id: string; name: string; archived: boolean };
export type Category = Catalog & { use: "income" | "expense" | "both" };
export type Label = Catalog & { kind: "property" | "beneficiary" };
export type Responsible = Catalog & { user_id: string | null };

export type Transaction = {
  id: string;
  kind: TxKind;
  account_id: string;
  to_account_id: string | null;
  amount_cents: number;
  effective_date: string;
  category_id: string | null;
  concept: string;
  detail: string | null;
  responsible_id: string | null;
  label_id: string | null;
  notes: string | null;
  status: "active" | "voided";
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export async function getBalances(supabase: Client) {
  const { data, error } = await supabase.rpc("account_balances");
  if (error) throw error;
  return (data ?? []) as AccountBalance[];
}

export async function getCatalogs(supabase: Client) {
  const [institutions, people, categories, labels] = await Promise.all([
    supabase.from("institutions").select("id, name, archived").order("name"),
    supabase.from("responsible_people").select("id, name, archived, user_id").order("name"),
    supabase.from("categories").select("id, name, archived, use").order("name"),
    supabase.from("reference_labels").select("id, name, archived, kind").order("name"),
  ]);
  return {
    institutions: (institutions.data ?? []) as Catalog[],
    people: (people.data ?? []) as Responsible[],
    categories: (categories.data ?? []) as Category[],
    labels: (labels.data ?? []) as Label[],
  };
}

export async function getProfileNames(supabase: Client) {
  const { data } = await supabase.from("profiles").select("id, full_name");
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, (p.full_name as string) || "Sin nombre"]));
}

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

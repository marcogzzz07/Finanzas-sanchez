"use server";

import { revalidatePath } from "next/cache";
import { optional, text, type FormState, formValues } from "@/lib/form";
import { parseBalance } from "@/lib/money";
import { friendlyError, requireMember } from "@/lib/session";

/** Guarda o corrige una revisión de saldo. El saldo registrado lo calcula la base a la fecha de corte. */
export async function saveReview(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };
  const declared = parseBalance(text(fd, "declared"));
  if (declared === null) return { error: "Escribe el saldo del estado de cuenta o del conteo.", values };
  const cutoff = text(fd, "cutoff_date");
  if (!cutoff) return { error: "Elige la fecha de corte.", values };
  const row = {
    account_id: text(fd, "account_id"),
    cutoff_date: cutoff,
    declared_cents: declared,
    recorded_cents: 0, // lo reemplaza la base
    note: optional(fd, "note"),
    document_id: optional(fd, "document_id"),
  };
  const id = text(fd, "id");
  const { error } = id
    ? await supabase.from("balance_reviews").update(row).eq("id", id)
    : await supabase.from("balance_reviews").insert(row);
  if (error) return { error: friendlyError(error), values };
  revalidatePath("/", "layout");
  return { ok: id ? "Revisión corregida." : "Revisión guardada." };
}

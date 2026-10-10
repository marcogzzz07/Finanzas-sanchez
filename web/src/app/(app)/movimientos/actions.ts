"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formValues, optional, text, type FormState } from "@/lib/form";
import type { TxKind } from "@/lib/labels";
import { parseAmount } from "@/lib/money";
import { friendlyError, requireMember } from "@/lib/session";

export async function saveTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta: no puedes registrar movimientos.", values };

  const id = text(fd, "id");
  const kind = text(fd, "kind") as TxKind;
  const amount = parseAmount(text(fd, "amount"));
  if (!["income", "expense", "transfer", "refund"].includes(kind)) return { error: "Elige el tipo de operación.", values };
  if (amount === null) return { error: "Escribe un importe mayor que cero, por ejemplo 1250.50.", values };
  if (!text(fd, "concept")) return { error: "Escribe el concepto.", values };
  if (!text(fd, "effective_date")) return { error: "Elige la fecha.", values };

  let categoryId = optional(fd, "category_id");
  const newCategory = text(fd, "new_category");
  if (kind !== "transfer" && newCategory) {
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: newCategory, use: kind === "income" ? "income" : "expense" })
      .select("id")
      .single();
    if (error) return { error: friendlyError(error), values };
    categoryId = data.id;
  }
  if (kind !== "transfer" && !categoryId) return { error: "Elige una categoría o escribe una nueva.", values };

  const row = {
    kind,
    account_id: text(fd, "account_id"),
    to_account_id: kind === "transfer" ? optional(fd, "to_account_id") : null,
    amount_cents: amount,
    effective_date: text(fd, "effective_date"),
    category_id: kind === "transfer" ? null : categoryId,
    concept: text(fd, "concept"),
    detail: optional(fd, "detail"),
    responsible_id: optional(fd, "responsible_id"),
    label_id: optional(fd, "label_id"),
    notes: optional(fd, "notes"),
  };
  if (kind === "transfer" && !row.to_account_id) return { error: "Elige la cuenta destino del traspaso.", values };

  const result = id
    ? await supabase.from("transactions").update(row).eq("id", id).select("id").single()
    : await supabase.from("transactions").insert(row).select("id").single();
  if (result.error) return { error: friendlyError(result.error), values };

  revalidatePath("/", "layout");
  redirect(`/movimientos/${result.data.id}?guardado=1`);
}

export async function voidTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "No tienes permiso para anular." };
  const reason = text(fd, "void_reason");
  if (!reason) return { error: "Escribe el motivo de la anulación." };
  const { error } = await supabase
    .from("transactions")
    .update({ status: "voided", void_reason: reason })
    .eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Movimiento anulado. Ya no cuenta en saldos ni resúmenes." };
}

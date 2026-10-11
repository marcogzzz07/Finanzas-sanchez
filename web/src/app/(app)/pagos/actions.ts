"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formValues, optional, text, type FormState } from "@/lib/form";
import { parseAmount } from "@/lib/money";
import { friendlyError, requireMember } from "@/lib/session";

type Fields = Record<string, unknown>;

/** Campos comunes de un pago (único o regla) leídos del formulario. */
function paymentFields(fd: FormData): { fields?: Fields; error?: string } {
  const concept = text(fd, "concept");
  if (!concept) return { error: "Escribe el concepto del pago." };
  const kind = text(fd, "kind") === "card_payment" ? "card_payment" : "regular";
  const amountRaw = text(fd, "amount");
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  if (amountRaw && amount === null) return { error: "El importe no es válido. Déjalo vacío si está por confirmar." };
  const card = optional(fd, "card_account_id");
  if (kind === "card_payment" && !card) return { error: "Elige la tarjeta que se va a pagar." };
  const category = optional(fd, "category_id");
  if (kind === "regular" && !category) return { error: "Elige una categoría." };
  return {
    fields: {
      concept,
      kind,
      category_id: kind === "regular" ? category : null,
      card_account_id: kind === "card_payment" ? card : null,
      responsible_id: optional(fd, "responsible_id"),
      label_id: optional(fd, "label_id"),
      expected_cents: amount,
      is_estimate: amount !== null && fd.get("is_estimate") === "on",
      notes: optional(fd, "notes"),
    },
  };
}

function recurrenceFields(fd: FormData): { fields?: Fields; error?: string } {
  const frequency = text(fd, "frequency");
  const start = text(fd, "due_date");
  const out: Fields = { frequency, start_date: start, end_date: optional(fd, "end_date") };
  if (frequency === "weekly") {
    const days = fd.getAll("weekdays").map(Number).filter((d) => d >= 0 && d <= 6);
    if (days.length === 0) return { error: "Marca al menos un día de la semana." };
    out.weekdays = days;
  } else if (frequency === "monthly") {
    out.day_of_month = Number(text(fd, "day_of_month")) || Number(start.slice(8, 10));
  } else if (frequency === "yearly") {
    out.day_of_month = Number(start.slice(8, 10));
    out.month_of_year = Number(start.slice(5, 7));
  } else if (frequency === "every_n_days") {
    const n = Number(text(fd, "interval_days"));
    if (!(n >= 1 && n <= 366)) return { error: "Escribe cada cuántos días (1 a 366)." };
    out.interval_days = n;
  } else {
    return { error: "Elige la repetición." };
  }
  return { fields: out };
}

function done(path?: string) {
  revalidatePath("/", "layout");
  if (path) redirect(path);
}

export async function createPayment(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };
  const due = text(fd, "due_date");
  if (!due) return { error: "Elige la fecha de vencimiento.", values };
  const base = paymentFields(fd);
  if (base.error) return { error: base.error, values };

  if (text(fd, "frequency") === "none") {
    const { data, error } = await supabase
      .from("payment_occurrences")
      .insert({ ...base.fields, due_date: due })
      .select("id")
      .single();
    if (error) return { error: friendlyError(error), values };
    done(`/pagos/${data.id}?guardado=1`);
  }

  const rec = recurrenceFields(fd);
  if (rec.error) return { error: rec.error, values };
  const { error } = await supabase
    .from("recurrence_rules")
    .insert({ ...base.fields, ...rec.fields, generate_from: due })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error), values };
  await supabase.rpc("generate_occurrences");
  done(`/pagos?guardado=1`);
  return {};
}

export async function updateOccurrence(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };
  const base = paymentFields(fd);
  if (base.error) return { error: base.error, values };
  const id = text(fd, "id");
  const { error } = await supabase
    .from("payment_occurrences")
    .update({ ...base.fields, due_date: text(fd, "due_date") })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: friendlyError(error), values };
  done();
  return { ok: "Este vencimiento quedó actualizado. La serie no cambia." };
}

export async function registerPayment(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };
  const amount = parseAmount(text(fd, "amount"));
  if (amount === null) return { error: "Escribe el importe real pagado.", values };
  const { data, error } = await supabase.rpc("register_payment", {
    p_occurrence: text(fd, "id"),
    p_account: text(fd, "account_id"),
    p_amount_cents: amount,
    p_date: text(fd, "date"),
    p_concept: optional(fd, "concept"),
  });
  if (error) return { error: friendlyError(error), values };
  done(`/pagos/${text(fd, "id")}?pagado=${data}`);
  return {};
}

export async function linkPayment(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const { error } = await supabase.rpc("link_payment", {
    p_occurrence: text(fd, "id"),
    p_transaction: text(fd, "transaction_id"),
  });
  if (error) return { error: friendlyError(error) };
  done(`/pagos/${text(fd, "id")}?vinculado=1`);
  return {};
}

export async function cancelOccurrence(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const restore = text(fd, "restore") === "1";
  const { error } = await supabase
    .from("payment_occurrences")
    .update(restore ? { status: "pending", cancel_reason: null } : { status: "cancelled", cancel_reason: optional(fd, "reason") ?? "Cancelado" })
    .eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  done();
  return { ok: restore ? "El pago vuelve a estar pendiente." : "Pago cancelado. Se conserva en el historial." };
}

export async function deleteOccurrence(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const { error, count } = await supabase
    .from("payment_occurrences")
    .delete({ count: "exact" })
    .eq("id", text(fd, "id"))
    .is("rule_id", null)
    .neq("status", "paid");
  if (error) return { error: friendlyError(error) };
  if (!count) return { error: "Solo se eliminan pagos únicos sin movimiento. Los de una serie se cancelan." };
  done("/pagos");
  return {};
}

export async function updateRule(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };
  const base = paymentFields(fd);
  if (base.error) return { error: base.error, values };
  const rec = recurrenceFields(fd);
  if (rec.error) return { error: rec.error, values };
  const id = text(fd, "id");
  const { error } = await supabase
    .from("recurrence_rules")
    .update({ ...base.fields, ...rec.fields })
    .eq("id", id);
  if (error) return { error: friendlyError(error), values };
  const { error: applyError } = await supabase.rpc("apply_rule_change", { p_rule: id });
  if (applyError) return { error: friendlyError(applyError), values };
  done();
  return { ok: "Serie actualizada desde hoy. Los pagos hechos y los vencidos se conservan." };
}

export async function setRuleActive(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const id = text(fd, "id");
  const active = text(fd, "active") === "true";
  const { error } = await supabase.from("recurrence_rules").update({ active }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  const { error: applyError } = await supabase.rpc("apply_rule_change", { p_rule: id });
  if (applyError) return { error: friendlyError(applyError) };
  done();
  return { ok: active ? "Serie reactivada desde hoy." : "Serie pausada. Los pendientes futuros se quitaron; el historial se conserva." };
}

export async function deleteRule(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const id = text(fd, "id");
  // Quita pendientes futuros; pagados, cancelados y vencidos se quedan como pagos sueltos.
  await supabase.from("recurrence_rules").update({ active: false }).eq("id", id);
  const { error: applyError } = await supabase.rpc("apply_rule_change", { p_rule: id });
  if (applyError) return { error: friendlyError(applyError) };
  const { error } = await supabase.from("recurrence_rules").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  done("/pagos?vista=reglas");
  return {};
}

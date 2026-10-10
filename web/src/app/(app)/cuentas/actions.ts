"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formValues, optional, text, type FormState } from "@/lib/form";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/labels";
import { parseBalance } from "@/lib/money";
import { friendlyError, requireMember } from "@/lib/session";

type Supabase = Awaited<ReturnType<typeof requireMember>>["supabase"];

/** Usa el elemento elegido o crea uno nuevo en el catálogo si se escribió un nombre. */
async function pickOrCreate(supabase: Supabase, table: "institutions" | "responsible_people", fd: FormData, field: string) {
  const name = text(fd, `new_${field}`);
  if (!name) return { id: optional(fd, field) };
  const { data, error } = await supabase.from(table).insert({ name }).select("id").single();
  return error ? { error: friendlyError(error) } : { id: data.id as string };
}

export async function saveAccount(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "Tu rol es de consulta.", values };

  const id = text(fd, "id");
  const name = text(fd, "name");
  if (!name) return { error: "Escribe el nombre de la cuenta.", values };

  const institution = await pickOrCreate(supabase, "institutions", fd, "institution_id");
  if (institution.error) return { error: institution.error, values };
  const responsible = await pickOrCreate(supabase, "responsible_people", fd, "responsible_id");
  if (responsible.error) return { error: responsible.error, values };

  const startDate = optional(fd, "start_date");
  const openingRaw = text(fd, "opening_balance");
  const opening = openingRaw ? parseBalance(openingRaw) : null;
  if (openingRaw && opening === null) return { error: "El saldo inicial no es un importe válido.", values };
  if ((startDate === null) !== (opening === null)) {
    return { error: "Captura fecha de inicio y saldo inicial juntos, o deja ambos vacíos hasta el primer estado de cuenta.", values };
  }

  const row: Record<string, unknown> = {
    name,
    institution_id: institution.id,
    responsible_id: responsible.id,
    holder: optional(fd, "holder"),
    start_date: startDate,
    opening_balance_cents: opening,
    available_for_payments: fd.get("available_for_payments") === "on",
    statement_mode: text(fd, "statement_mode") === "auto" ? "auto" : "review",
  };
  if (!id) {
    const type = text(fd, "type") as AccountType;
    if (!(type in ACCOUNT_TYPES)) return { error: "Elige el tipo de cuenta.", values };
    row.type = type;
  }

  const result = id
    ? await supabase.from("accounts").update(row).eq("id", id).select("id").single()
    : await supabase.from("accounts").insert(row).select("id").single();
  if (result.error) return { error: friendlyError(result.error), values };

  revalidatePath("/", "layout");
  redirect(`/cuentas/${result.data.id}?guardado=1`);
}

export async function setArchived(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "No tienes permiso." };
  const archived = text(fd, "archived") === "true";
  const { error } = await supabase.from("accounts").update({ archived }).eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: archived ? "Cuenta archivada." : "Cuenta reactivada." };
}

export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "No tienes permiso." };
  const { error } = await supabase.from("accounts").delete().eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  redirect("/cuentas");
}

export async function changeType(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const values = formValues(fd);
  if (!canWrite) return { error: "No tienes permiso.", values };
  const id = text(fd, "id");
  const openingRaw = text(fd, "opening_balance");
  const opening = openingRaw ? parseBalance(openingRaw) : null;
  if (openingRaw && opening === null) return { error: "El saldo inicial no es un importe válido.", values };

  const { error } = await supabase.rpc("change_account_type", {
    p_account: id,
    p_new_type: text(fd, "new_type"),
    p_opening_cents: opening,
    p_void_tx_ids: fd.getAll("void_ids").map(String),
    p_void_reason: optional(fd, "void_reason"),
  });
  if (error) return { error: friendlyError(error), values };
  revalidatePath("/", "layout");
  redirect(`/cuentas/${id}?guardado=1`);
}

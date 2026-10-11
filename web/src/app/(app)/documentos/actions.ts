"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { optional, text, type FormState } from "@/lib/form";
import { friendlyError, requireMember } from "@/lib/session";

const MIME = ["application/pdf", "image/jpeg", "image/png"];
const KINDS = ["statement", "receipt", "other"];

export type NewDocument = {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  account_id: string | null;
  transaction_id: string | null;
  period_start: string | null;
  period_end: string | null;
  cutoff_date: string | null;
  notes: string | null;
  replaces_id: string | null;
};

/** Registra un archivo ya subido al bucket privado. Si falla, el navegador borra el archivo. */
export async function createDocument(doc: NewDocument): Promise<{ id?: string; error?: string }> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta: no puedes subir documentos." };
  const { data: settings } = await supabase.from("family_settings").select("max_upload_mb").eq("id", 1).single();
  const maxBytes = Number(settings?.max_upload_mb ?? 10) * 1024 * 1024;
  if (!MIME.includes(doc.mime_type)) return { error: "Solo se aceptan PDF, JPG o PNG." };
  if (doc.size_bytes > maxBytes) return { error: `El archivo pasa del límite de ${settings?.max_upload_mb ?? 10} MB.` };
  if (!KINDS.includes(doc.kind)) return { error: "Tipo de documento no válido." };
  if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(doc.storage_path)) return { error: "Ruta de archivo no válida." };

  const { data, error } = await supabase.from("documents").insert(doc).select("id").single();
  if (error) return { error: friendlyError(error) };
  if (doc.replaces_id) {
    // El anterior queda retirado pero se conserva si respalda algo.
    await supabase.from("documents").update({ archived: true }).eq("id", doc.replaces_id);
  }
  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function updateDocument(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const name = text(fd, "file_name");
  if (!name) return { error: "Escribe un nombre." };
  const { error } = await supabase
    .from("documents")
    .update({
      file_name: name,
      kind: text(fd, "kind"),
      account_id: optional(fd, "account_id"),
      period_start: optional(fd, "period_start"),
      period_end: optional(fd, "period_end"),
      cutoff_date: optional(fd, "cutoff_date"),
      notes: optional(fd, "notes"),
    })
    .eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Datos del documento actualizados." };
}

export async function setDocumentArchived(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const archived = text(fd, "archived") === "true";
  const { error } = await supabase.from("documents").update({ archived }).eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: archived ? "Documento retirado. Se conserva como historial." : "Documento restaurado." };
}

export async function deleteDocument(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) return { error: "Tu rol es de consulta." };
  const id = text(fd, "id");
  const { data: links } = await supabase.rpc("document_links", { p_id: id });
  if (Number(links ?? 0) > 0) {
    return { error: "Este documento respalda un movimiento o una revisión de saldo. Retíralo en lugar de eliminarlo." };
  }
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  if (doc) await supabase.storage.from("documents").remove([doc.storage_path]);
  revalidatePath("/", "layout");
  redirect("/documentos?eliminado=1");
}

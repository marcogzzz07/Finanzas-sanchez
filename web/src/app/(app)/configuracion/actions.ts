"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { formValues, optional, text, type FormState } from "@/lib/form";
import { ROLES } from "@/lib/labels";
import { friendlyError, requireMember } from "@/lib/session";
import { createAuthAdminClient } from "@/lib/supabase/server";

const CATALOGS = ["institutions", "responsible_people", "categories", "reference_labels"] as const;
type CatalogTable = (typeof CATALOGS)[number];

function catalogTable(fd: FormData): CatalogTable | null {
  const t = text(fd, "table");
  return (CATALOGS as readonly string[]).includes(t) ? (t as CatalogTable) : null;
}

function done(ok: string): FormState {
  revalidatePath("/", "layout");
  return { ok };
}

export async function saveCatalogItem(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const table = catalogTable(fd);
  if (!canWrite || !table) return { error: "No tienes permiso." };
  const name = text(fd, "name");
  if (!name) return { error: "Escribe un nombre.", values: formValues(fd) };

  const row: Record<string, unknown> = { name };
  if (table === "categories") row.use = text(fd, "use");
  if (table === "reference_labels") row.kind = text(fd, "kind");
  if (table === "responsible_people") row.user_id = optional(fd, "user_id");

  const id = text(fd, "id");
  const { error } = id
    ? await supabase.from(table).update(row).eq("id", id)
    : await supabase.from(table).insert(row);
  if (error) return { error: friendlyError(error), values: formValues(fd) };
  return done(id ? "Cambios guardados." : "Agregado.");
}

export async function setCatalogArchived(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const table = catalogTable(fd);
  if (!canWrite || !table) return { error: "No tienes permiso." };
  const archived = text(fd, "archived") === "true";
  const { error } = await supabase.from(table).update({ archived }).eq("id", text(fd, "id"));
  if (error) return { error: friendlyError(error) };
  return done(archived ? "Archivado. Ya no aparece en nuevas capturas; su historial se conserva." : "Reactivado.");
}

export async function removeCatalogItem(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, canWrite } = await requireMember();
  const table = catalogTable(fd);
  if (!canWrite || !table) return { error: "No tienes permiso." };
  const id = text(fd, "id");
  const target = optional(fd, "reassign_to");
  if (target) {
    const { error } = await supabase.rpc("reassign_catalog", { p_catalog: table, p_from: id, p_to: target });
    if (error) return { error: friendlyError(error) };
  }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  return done(target ? "Registros reasignados y elemento eliminado." : "Eliminado.");
}

export async function updateMyProfile(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await requireMember();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: text(fd, "full_name"), email_opt_in: fd.get("email_opt_in") === "on" })
    .eq("id", userId);
  if (error) return { error: friendlyError(error) };
  return done("Perfil actualizado.");
}

export async function inviteUser(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, isAdmin } = await requireMember();
  const values = formValues(fd);
  if (!isAdmin) return { error: "Solo un administrador puede invitar.", values };
  const email = text(fd, "email").toLowerCase();
  const role = text(fd, "role");
  if (!email.includes("@")) return { error: "Escribe un correo válido.", values };
  if (!(role in ROLES)) return { error: "Elige un rol.", values };

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  let admin;
  try {
    admin = createAuthAdminClient();
  } catch {
    return { error: "Falta configurar SUPABASE_SECRET_KEY en el servidor para enviar invitaciones.", values };
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: text(fd, "full_name") },
    redirectTo: `${origin}/auth/confirm?next=/actualizar-contrasena`,
  });
  if (error || !data.user) return { error: error?.message ?? "No se pudo invitar.", values };

  // El rol se asigna con la sesión del administrador; la base verifica que lo sea.
  const { error: accessError } = await supabase.rpc("admin_set_access", {
    p_user: data.user.id,
    p_role: role,
    p_active: true,
  });
  if (accessError) return { error: friendlyError(accessError), values };
  return done(`Invitación enviada a ${email}.`);
}

export async function setAccess(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, isAdmin } = await requireMember();
  if (!isAdmin) return { error: "Solo un administrador puede cambiar accesos." };
  const userId = text(fd, "user_id");
  const { error } = await supabase.rpc("admin_set_access", {
    p_user: userId,
    p_role: text(fd, "role"),
    p_active: fd.get("active") === "on",
  });
  if (error) return { error: friendlyError(error) };
  const name = optional(fd, "full_name");
  if (name !== null) await supabase.rpc("admin_set_name", { p_user: userId, p_full_name: name });
  return done("Acceso actualizado.");
}

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, isAdmin } = await requireMember();
  if (!isAdmin) return { error: "Solo un administrador puede cambiar la configuración global." };
  const hour = Number(text(fd, "digest_hour"));
  const lead = Number(text(fd, "lead_days"));
  const maxMb = Number(text(fd, "max_upload_mb"));
  const { error } = await supabase
    .from("family_settings")
    .update({
      digest_hour: hour,
      lead_days: lead,
      max_upload_mb: maxMb,
      global_recipient_id: optional(fd, "global_recipient_id"),
    })
    .eq("id", 1);
  if (error) return { error: friendlyError(error) };
  return done("Configuración guardada. Aplica sin redesplegar.");
}

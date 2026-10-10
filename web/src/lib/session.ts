import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "editor" | "viewer";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
  email_opt_in: boolean;
};

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  // RLS solo devuelve el perfil si la persona tiene acceso activo.
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? "", profile };
});

/** Exige sesión y acceso activo. Devuelve el cliente con RLS y el perfil. */
export async function requireMember() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/sin-acceso");
  const { profile } = session;
  return {
    ...session,
    profile,
    canWrite: profile.role === "admin" || profile.role === "editor",
    isAdmin: profile.role === "admin",
  };
}

/** Convierte un error de Postgres/PostgREST en un mensaje para la persona. */
export function friendlyError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  if (error.code === "23505") return "Ya existe un registro activo con ese nombre.";
  if (error.code === "23503") return "Este registro está en uso. Reasígnalo o archívalo en lugar de eliminarlo.";
  if (error.code === "42501") return error.message?.includes("permission") ? "No tienes permiso para esta acción." : error.message!;
  return error.message || "Ocurrió un error inesperado.";
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formValues, text, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: text(fd, "email"), password: text(fd, "password") });
  if (error) return { error: "Correo o contraseña incorrectos.", values: { email: text(fd, "email") } };
  redirect("/");
}

export async function requestReset(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  await supabase.auth.resetPasswordForEmail(text(fd, "email"), {
    redirectTo: `${origin}/auth/confirm?next=/actualizar-contrasena`,
  });
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos tienen acceso.
  return { ok: "Si el correo tiene acceso, recibirás un enlace para crear una contraseña nueva." };
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const password = text(fd, "password");
  if (password.length < 8) return { error: "Usa al menos 8 caracteres.", values: formValues(fd) };
  if (password !== text(fd, "confirm")) return { error: "Las contraseñas no coinciden." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

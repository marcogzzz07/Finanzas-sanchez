"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente del navegador con la sesión de la persona (RLS). Solo para subir archivos al bucket privado. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}

"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form";

/** Formulario con mensajes de error y confirmación junto a la acción. */
export function ActionForm({
  action,
  children,
  className = "stack",
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, run] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={run} className={className}>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="notice">{state.ok}</p>}
      {children}
    </form>
  );
}

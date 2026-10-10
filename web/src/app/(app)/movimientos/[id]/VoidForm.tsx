"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { voidTransaction } from "../actions";

export function VoidForm({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(voidTransaction, {});
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <p className="muted">Anular no borra el registro: deja de contar en saldos y resúmenes y queda en el historial.</p>
      <input type="hidden" name="id" value={id} />
      <label>
        <span>Motivo</span>
        <input name="void_reason" required placeholder="Por ejemplo: capturado dos veces" />
      </label>
      <SubmitButton className="danger" confirm="¿Anular este movimiento?">
        Anular movimiento
      </SubmitButton>
    </form>
  );
}

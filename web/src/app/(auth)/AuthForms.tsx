"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { requestReset, signIn, updatePassword } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <label>
        <span>Correo</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </label>
      <label>
        <span>Contraseña</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <SubmitButton>Entrar</SubmitButton>
      <p className="muted">
        <Link href="/recuperar">Olvidé mi contraseña</Link>
      </p>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(requestReset, {});
  return (
    <form action={action} className="stack">
      {state.ok && <p className="notice">{state.ok}</p>}
      <label>
        <span>Correo</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <SubmitButton>Enviar enlace</SubmitButton>
      <p className="muted">
        <Link href="/login">Volver a entrar</Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <label>
        <span>Contraseña nueva</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        <span>Repite la contraseña</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <SubmitButton>Guardar contraseña</SubmitButton>
    </form>
  );
}

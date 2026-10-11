"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { centsToInput, formatCents, parseAmount } from "@/lib/money";
import { cancelOccurrence, deleteOccurrence, linkPayment, registerPayment } from "../actions";

type Option = { id: string; name: string };

export function RegisterPaymentForm({
  id,
  expectedCents,
  accounts,
  today,
  concept,
}: {
  id: string;
  expectedCents: number | null;
  accounts: Option[];
  today: string;
  concept: string;
}) {
  const [state, run] = useActionState<FormState, FormData>(registerPayment, {});
  const v = state.values;
  const [amount, setAmount] = useState(v?.amount ?? centsToInput(expectedCents));
  const [accountId, setAccountId] = useState(v?.account_id ?? accounts[0]?.id ?? "");
  const cents = parseAmount(amount);
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "";

  if (accounts.length === 0) return <p className="error">No hay cuentas activas desde las cuales pagar.</p>;

  return (
    <form action={run} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <label>
        <span>Importe real pagado</span>
        <input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        {expectedCents !== null && cents !== null && cents !== expectedCents && (
          <span className="muted">Se guarda aparte del previsto ({formatCents(expectedCents)}).</span>
        )}
      </label>
      <label>
        <span>Fecha del pago</span>
        <input type="date" name="date" required defaultValue={v?.date ?? today} />
      </label>
      <label>
        <span>Pagado desde</span>
        <select name="account_id" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Concepto del movimiento</span>
        <input name="concept" defaultValue={v?.concept ?? concept} />
      </label>
      <SubmitButton
        confirm={cents !== null ? `¿Registrar pago de ${formatCents(cents)} desde ${accountName}?` : undefined}
      >
        Registrar pago
      </SubmitButton>
    </form>
  );
}

export function LinkPaymentForm({ id, candidates }: { id: string; candidates: { id: string; label: string }[] }) {
  const [state, run] = useActionState<FormState, FormData>(linkPayment, {});
  if (candidates.length === 0) return <p className="muted">No hay movimientos compatibles sin vincular de los últimos 60 días.</p>;
  return (
    <form action={run} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <label>
        <span>Movimiento ya capturado</span>
        <select name="transaction_id" required>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>
      <p className="muted">Vincular no crea otro movimiento ni cambia saldos.</p>
      <SubmitButton className="secondary">Vincular</SubmitButton>
    </form>
  );
}

export function CancelForm({ id, cancelled }: { id: string; cancelled: boolean }) {
  const [state, run] = useActionState<FormState, FormData>(cancelOccurrence, {});
  return (
    <form action={run} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="notice">{state.ok}</p>}
      <input type="hidden" name="id" value={id} />
      {cancelled ? (
        <>
          <input type="hidden" name="restore" value="1" />
          <SubmitButton className="secondary">Volver a pendiente</SubmitButton>
        </>
      ) : (
        <>
          <label>
            <span>Motivo (opcional)</span>
            <input name="reason" placeholder="Por ejemplo: no hubo servicio esta semana" />
          </label>
          <SubmitButton className="secondary" confirm="¿Cancelar este pago? Se conserva en el historial.">
            Cancelar este pago
          </SubmitButton>
        </>
      )}
    </form>
  );
}

export function DeleteOccurrenceForm({ id }: { id: string }) {
  const [state, run] = useActionState<FormState, FormData>(deleteOccurrence, {});
  return (
    <form action={run} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="danger" confirm="Se eliminará este pago definitivamente. ¿Continuar?">
        Eliminar pago
      </SubmitButton>
    </form>
  );
}

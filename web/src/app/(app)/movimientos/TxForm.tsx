"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { ACCOUNT_TYPES, kindsForAccount, TX_KINDS, type AccountType, type TxKind } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import { saveTransaction } from "./actions";

type Option = { id: string; name: string };
type AccountOption = Option & { type: AccountType };
type CategoryOption = Option & { use: "income" | "expense" | "both" };

export type TxInitial = {
  id?: string;
  kind: TxKind;
  account_id?: string;
  to_account_id?: string | null;
  amount_cents?: number;
  effective_date: string;
  category_id?: string | null;
  concept?: string;
  detail?: string | null;
  responsible_id?: string | null;
  label_id?: string | null;
  notes?: string | null;
};

export function TxForm({
  initial,
  accounts,
  categories,
  people,
  labels,
}: {
  initial: TxInitial;
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: Option[];
  labels: Option[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveTransaction, {});
  const v = state.values;
  const [kind, setKind] = useState<TxKind>((v?.kind as TxKind) ?? initial.kind);
  const [accountId, setAccountId] = useState(v?.account_id ?? initial.account_id ?? accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const allowed = account ? kindsForAccount(account.type) : (Object.keys(TX_KINDS) as TxKind[]);
  const effectiveKind = allowed.includes(kind) ? kind : allowed[0];
  const fitting = categories.filter((c) =>
    effectiveKind === "income" ? c.use !== "expense" : c.use !== "income",
  );
  const destinations = accounts.filter((a) => a.id !== accountId);

  if (accounts.length === 0) {
    return <p className="error">No hay cuentas activas. Agrega una en Cuentas antes de registrar movimientos.</p>;
  }

  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
        <span>Tipo de operación</span>
        <div className="actions" style={{ margin: 0 }}>
          {allowed.map((k) => (
            <label key={k} className="check card" style={{ margin: 0, flex: "1 1 120px" }}>
              <input type="radio" name="kind" value={k} checked={effectiveKind === k} onChange={() => setKind(k)} />
              {TX_KINDS[k]}
            </label>
          ))}
        </div>
        {account?.type === "credit" && (
          <span className="muted">
            En tarjeta de crédito: gasto aumenta la deuda y devolución la reduce. El pago de la tarjeta se registra como
            traspaso desde la cuenta que paga.
          </span>
        )}
      </fieldset>

      <label>
        <span>{effectiveKind === "transfer" ? "Cuenta origen" : "Cuenta"}</span>
        <select name="account_id" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({ACCOUNT_TYPES[a.type]})
            </option>
          ))}
        </select>
      </label>

      {effectiveKind === "transfer" && (
        <label>
          <span>Cuenta destino</span>
          <select name="to_account_id" defaultValue={v?.to_account_id ?? initial.to_account_id ?? ""} required>
            <option value="">Elige…</option>
            {destinations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPES[a.type]})
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <span>Importe (MXN)</span>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
          defaultValue={v?.amount ?? centsToInput(initial.amount_cents)}
        />
      </label>

      <label>
        <span>Fecha</span>
        <input name="effective_date" type="date" required defaultValue={v?.effective_date ?? initial.effective_date} />
      </label>

      <label>
        <span>Concepto</span>
        <input name="concept" required maxLength={200} defaultValue={v?.concept ?? initial.concept ?? ""} />
      </label>

      {effectiveKind !== "transfer" && (
        <>
          <label>
            <span>Categoría</span>
            <select name="category_id" defaultValue={v?.category_id ?? initial.category_id ?? ""}>
              <option value="">Elige…</option>
              {fitting.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">o agrega una categoría nueva</span>
            <input name="new_category" placeholder="Nombre de la categoría" defaultValue={v?.new_category ?? ""} />
          </label>
        </>
      )}

      <details>
        <summary>Más datos (opcional)</summary>
        <div className="stack">
          <label>
            <span>Detalle</span>
            <textarea name="detail" rows={2} defaultValue={v?.detail ?? initial.detail ?? ""} />
          </label>
          <label>
            <span>Responsable</span>
            <select name="responsible_id" defaultValue={v?.responsible_id ?? initial.responsible_id ?? ""}>
              <option value="">Sin responsable</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Inmueble o beneficiario</span>
            <select name="label_id" defaultValue={v?.label_id ?? initial.label_id ?? ""}>
              <option value="">Ninguno</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Notas</span>
            <textarea name="notes" rows={2} defaultValue={v?.notes ?? initial.notes ?? ""} />
          </label>
        </div>
      </details>

      <SubmitButton>{initial.id ? "Guardar cambios" : "Guardar"}</SubmitButton>
    </form>
  );
}

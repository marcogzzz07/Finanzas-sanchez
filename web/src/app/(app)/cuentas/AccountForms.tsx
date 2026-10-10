"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/labels";
import { centsToInput, formatCents } from "@/lib/money";
import { changeType, deleteAccount, saveAccount, setArchived } from "./actions";

type Option = { id: string; name: string };

export type AccountInitial = {
  id?: string;
  name?: string;
  type?: AccountType;
  institution_id?: string | null;
  responsible_id?: string | null;
  holder?: string | null;
  start_date?: string | null;
  opening_balance_cents?: number | null;
  available_for_payments?: boolean;
  statement_mode?: "review" | "auto";
};

export function AccountForm({
  initial,
  institutions,
  people,
}: {
  initial: AccountInitial;
  institutions: Option[];
  people: Option[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveAccount, {});
  const v = state.values;
  const isNew = !initial.id;
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <label>
        <span>Nombre</span>
        <input name="name" required defaultValue={v?.name ?? initial.name ?? ""} placeholder="Por ejemplo: Banorte nómina" />
      </label>

      {isNew && (
        <label>
          <span>Tipo</span>
          <select name="type" required defaultValue={v?.type ?? initial.type ?? "bank"}>
            {Object.entries(ACCOUNT_TYPES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <span className="muted">
            Si una tarjeta de débito y su cuenta bancaria son el mismo dinero, registra una sola cuenta.
          </span>
        </label>
      )}

      <label>
        <span>Banco o institución</span>
        <select name="institution_id" defaultValue={v?.institution_id ?? initial.institution_id ?? ""}>
          <option value="">Sin institución</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="muted">o agrega un banco nuevo</span>
        <input name="new_institution_id" placeholder="Nombre del banco" defaultValue={v?.new_institution_id ?? ""} />
      </label>

      <label>
        <span>Responsable</span>
        <select name="responsible_id" defaultValue={v?.responsible_id ?? initial.responsible_id ?? ""}>
          <option value="">Sin responsable</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="muted">o agrega una persona nueva</span>
        <input name="new_responsible_id" placeholder="Nombre" defaultValue={v?.new_responsible_id ?? ""} />
      </label>

      <label>
        <span>Titular o beneficiario (opcional)</span>
        <input name="holder" defaultValue={v?.holder ?? initial.holder ?? ""} />
      </label>

      <label className="check">
        <input
          type="checkbox"
          name="available_for_payments"
          defaultChecked={v ? v.available_for_payments === "on" : initial.available_for_payments ?? false}
        />
        Disponible para pagos (suma al dinero para pagos; no aplica a tarjetas de crédito)
      </label>

      <fieldset className="card" style={{ margin: 0 }}>
        <legend className="muted">Saldo de arranque</legend>
        <p className="muted">
          Déjalo vacío si aún no lo sabes: se completa con el primer estado de cuenta que subas a la Bandeja. En tarjeta de
          crédito es la deuda (negativo si hay saldo a favor).
        </p>
        <label>
          <span>Fecha de inicio</span>
          <input type="date" name="start_date" defaultValue={v?.start_date ?? initial.start_date ?? ""} />
        </label>
        <label>
          <span>Saldo al inicio de esa fecha</span>
          <input
            name="opening_balance"
            inputMode="decimal"
            defaultValue={v?.opening_balance ?? centsToInput(initial.opening_balance_cents)}
          />
        </label>
      </fieldset>

      <label>
        <span>Registro desde estados de cuenta</span>
        <select name="statement_mode" defaultValue={v?.statement_mode ?? initial.statement_mode ?? "review"}>
          <option value="review">Con revisión: confirmo las líneas leídas antes de registrarlas</option>
          <option value="auto">Automático: registrar solas las líneas claras</option>
        </select>
      </label>

      <SubmitButton>{isNew ? "Crear cuenta" : "Guardar cambios"}</SubmitButton>
    </form>
  );
}

export function ArchiveForm({ id, archived, impact }: { id: string; archived: boolean; impact?: string }) {
  const [state, action] = useActionState<FormState, FormData>(setArchived, {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="notice">{state.ok}</p>}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={String(!archived)} />
      {!archived && (
        <p className="muted">
          Archivar la quita de nuevas capturas y del dinero para pagos. Conserva su historial y se puede reactivar.
          {impact ? ` ${impact}` : ""}
        </p>
      )}
      <SubmitButton className="secondary" confirm={archived ? undefined : "¿Archivar esta cuenta?"}>
        {archived ? "Reactivar cuenta" : "Archivar cuenta"}
      </SubmitButton>
    </form>
  );
}

export function DeleteForm({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="danger" confirm="Se eliminará la cuenta definitivamente. ¿Continuar?">
        Eliminar cuenta
      </SubmitButton>
    </form>
  );
}

export type Incompatible = { id: string; kind: string; effective_date: string; concept: string; amount_cents: number };

export function TypeChangeForm({
  id,
  newType,
  incompatible,
  currentBalance,
  newBalance,
  hasOpening,
  openingCents,
}: {
  id: string;
  newType: AccountType;
  incompatible: Incompatible[];
  currentBalance: number;
  newBalance: number;
  hasOpening: boolean;
  openingCents: number | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(changeType, {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="new_type" value={newType} />
      <p>
        Saldo actual: <strong className="num">{formatCents(currentBalance)}</strong>. Con el tipo{" "}
        <strong>{ACCOUNT_TYPES[newType]}</strong> quedaría en <strong className="num">{formatCents(newBalance)}</strong>
        {newType === "credit" ? " de deuda" : ""}, sin contar los movimientos incompatibles.
      </p>
      {hasOpening && (
        <label>
          <span>Confirma el saldo inicial con el nuevo tipo{newType === "credit" ? " (deuda)" : ""}</span>
          <input name="opening_balance" inputMode="decimal" required defaultValue={state.values?.opening_balance ?? centsToInput(openingCents)} />
        </label>
      )}
      {incompatible.length > 0 && (
        <>
          <p className="error">
            Estos movimientos no son válidos con el nuevo tipo. Márcalos para anularlos, o corrígelos uno por uno antes de
            continuar.
          </p>
          <ul className="list">
            {incompatible.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" name="void_ids" value={t.id} defaultChecked />
                  {t.effective_date} · {t.concept} · {formatCents(t.amount_cents)}
                </label>
              </li>
            ))}
          </ul>
          <label>
            <span>Motivo de la anulación</span>
            <input name="void_reason" defaultValue={state.values?.void_reason ?? "Cambio de tipo de cuenta"} />
          </label>
        </>
      )}
      <p className="muted">
        Todo se guarda junto: si algo falla, no cambia nada. Las revisiones de saldo de esta cuenta quedarán marcadas como
        desactualizadas.
      </p>
      <SubmitButton confirm="¿Aplicar el cambio de tipo?">Cambiar tipo</SubmitButton>
    </form>
  );
}

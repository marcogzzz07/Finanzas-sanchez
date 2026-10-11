"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "@/lib/form";
import { centsToInput } from "@/lib/money";
import { createPayment, updateOccurrence, updateRule } from "./actions";

type Option = { id: string; name: string };

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export type PaymentInitial = {
  id?: string;
  concept?: string;
  kind?: "regular" | "card_payment";
  due_date?: string;
  category_id?: string | null;
  card_account_id?: string | null;
  responsible_id?: string | null;
  label_id?: string | null;
  expected_cents?: number | null;
  is_estimate?: boolean;
  notes?: string | null;
  frequency?: "none" | "weekly" | "monthly" | "yearly" | "every_n_days";
  weekdays?: number[] | null;
  day_of_month?: number | null;
  interval_days?: number | null;
  end_date?: string | null;
};

/**
 * mode "new": pago único o serie. "occurrence": solo este vencimiento. "rule": la serie desde hoy.
 */
export function PaymentForm({
  mode,
  initial,
  categories,
  people,
  labels,
  cards,
  futureCount,
}: {
  mode: "new" | "occurrence" | "rule";
  initial: PaymentInitial;
  categories: Option[];
  people: Option[];
  labels: Option[];
  cards: Option[];
  futureCount?: number;
}) {
  const action = mode === "new" ? createPayment : mode === "rule" ? updateRule : updateOccurrence;
  const [state, run] = useActionState<FormState, FormData>(action, {});
  const v = state.values;
  const [kind, setKind] = useState(v?.kind ?? initial.kind ?? "regular");
  const [frequency, setFrequency] = useState(v?.frequency ?? initial.frequency ?? "none");
  const showRecurrence = mode !== "occurrence";
  const days = v?.weekdays ? v.weekdays.split(",").map(Number) : initial.weekdays ?? [];

  return (
    <form action={run} className="stack">
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="notice">{state.ok}</p>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <fieldset>
        <legend>Tipo de pago</legend>
        <div className="pills">
          <label>
            <input type="radio" name="kind" value="regular" checked={kind === "regular"} onChange={() => setKind("regular")} />
            Gasto
          </label>
          <label>
            <input type="radio" name="kind" value="card_payment" checked={kind === "card_payment"} onChange={() => setKind("card_payment")} disabled={cards.length === 0} />
            Pago de tarjeta
          </label>
        </div>
        {kind === "card_payment" && (
          <span className="muted">
            Se registra como traspaso a la tarjeta, sin volver a contar los gastos. Captura el importe y la fecha límite del estado de cuenta.
          </span>
        )}
      </fieldset>

      <label>
        <span>Concepto</span>
        <input name="concept" required defaultValue={v?.concept ?? initial.concept ?? ""} placeholder="Por ejemplo: Enfermero fin de semana" />
      </label>

      {kind === "card_payment" ? (
        <label>
          <span>Tarjeta a pagar</span>
          <select name="card_account_id" defaultValue={v?.card_account_id ?? initial.card_account_id ?? ""} required>
            <option value="">Elige…</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          <span>Categoría</span>
          <select name="category_id" defaultValue={v?.category_id ?? initial.category_id ?? ""} required>
            <option value="">Elige…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        <span>{showRecurrence && frequency !== "none" ? "Primer vencimiento" : "Vencimiento"}</span>
        <input type="date" name="due_date" required defaultValue={v?.due_date ?? initial.due_date ?? ""} />
      </label>

      <label>
        <span>Importe (déjalo vacío si está por confirmar)</span>
        <input name="amount" inputMode="decimal" placeholder="Por confirmar" defaultValue={v?.amount ?? centsToInput(initial.expected_cents)} />
      </label>
      <label className="check">
        <input type="checkbox" name="is_estimate" defaultChecked={v ? v.is_estimate === "on" : initial.is_estimate ?? false} />
        Es un importe estimado (por ejemplo, luz o agua)
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

      {showRecurrence && (
        <fieldset className="card" style={{ margin: 0 }}>
          <legend>Repetición</legend>
          <label>
            <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {mode === "new" && <option value="none">Sin repetición</option>}
              <option value="weekly">Semanal (uno o varios días)</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual (mismo día y mes del vencimiento)</option>
              <option value="every_n_days">Cada N días</option>
            </select>
          </label>
          {frequency === "weekly" && (
            <div className="pills" style={{ marginTop: 12 }}>
              {WEEKDAYS.map((d, i) => (
                <label key={d}>
                  <input type="checkbox" name="weekdays" value={i} defaultChecked={days.includes(i)} />
                  {d}
                </label>
              ))}
            </div>
          )}
          {frequency === "monthly" && (
            <label style={{ marginTop: 12 }}>
              <span>Día del mes (si no existe, se usa el último)</span>
              <input type="number" name="day_of_month" min={1} max={31} defaultValue={v?.day_of_month ?? initial.day_of_month ?? ""} />
            </label>
          )}
          {frequency === "every_n_days" && (
            <label style={{ marginTop: 12 }}>
              <span>Cada cuántos días</span>
              <input type="number" name="interval_days" min={1} max={366} defaultValue={v?.interval_days ?? initial.interval_days ?? 14} />
            </label>
          )}
          {frequency !== "none" && (
            <label style={{ marginTop: 12 }}>
              <span>Termina (opcional)</span>
              <input type="date" name="end_date" defaultValue={v?.end_date ?? initial.end_date ?? ""} />
            </label>
          )}
        </fieldset>
      )}

      <details>
        <summary>Más datos (opcional)</summary>
        <div className="stack">
          <label>
            <span>Inmueble o beneficiario</span>
            <select name="label_id" defaultValue={v?.label_id ?? initial.label_id ?? ""}>
              <option value="">Ninguno</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Notas</span>
            <textarea name="notes" rows={2} defaultValue={v?.notes ?? initial.notes ?? ""} />
          </label>
        </div>
      </details>

      {mode === "rule" && (
        <p className="muted">
          Al guardar se reemplazan {futureCount ?? 0} pendiente(s) desde hoy. Los pagos hechos, cancelados y vencidos no cambian.
        </p>
      )}

      <SubmitButton confirm={mode === "rule" ? `Se reemplazarán ${futureCount ?? 0} pendiente(s) futuros. ¿Continuar?` : undefined}>
        {mode === "new" ? "Guardar pago" : mode === "rule" ? "Guardar serie" : "Guardar este vencimiento"}
      </SubmitButton>
    </form>
  );
}

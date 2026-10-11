import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/data";
import { centsToInput, formatCents } from "@/lib/money";
import { saveReview } from "../reviews";

export type Review = {
  id: string;
  cutoff_date: string;
  declared_cents: number;
  recorded_cents: number;
  note: string | null;
  document_id: string | null;
  stale: boolean;
  created_by: string | null;
  created_at: string;
};

type Option = { id: string; name: string };

function ReviewFields({ accountId, review, documents, today }: { accountId: string; review?: Review; documents: Option[]; today: string }) {
  return (
    <>
      <input type="hidden" name="account_id" value={accountId} />
      {review && <input type="hidden" name="id" value={review.id} />}
      <div className="filters">
        <label className="field">
          <span>Fecha de corte</span>
          <input type="date" name="cutoff_date" required defaultValue={review?.cutoff_date ?? today} />
        </label>
        <label className="field">
          <span>Saldo del documento o conteo</span>
          <input name="declared" inputMode="decimal" required defaultValue={review ? centsToInput(review.declared_cents) : ""} />
        </label>
      </div>
      <label>
        <span>Evidencia (opcional)</span>
        <select name="document_id" defaultValue={review?.document_id ?? ""}>
          <option value="">Sin documento</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Nota (opcional)</span>
        <input name="note" defaultValue={review?.note ?? ""} />
      </label>
    </>
  );
}

export function Reviews({
  accountId,
  isCredit,
  reviews,
  documents,
  people,
  canWrite,
  today,
  currentAtCutoff,
}: {
  accountId: string;
  isCredit: boolean;
  reviews: Review[];
  documents: Option[];
  people: Record<string, string>;
  canWrite: boolean;
  today: string;
  currentAtCutoff: Record<string, number>;
}) {
  return (
    <div className="stack">
      <p className="muted">
        Compara el saldo{isCredit ? " (deuda)" : ""} del estado de cuenta o del conteo con el saldo registrado a esa fecha, incluyendo todo el día.
        No corrige nada automáticamente. Que coincida no significa que cada movimiento esté conciliado.
      </p>
      {reviews.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Corte</th>
              <th className="num">Declarado</th>
              <th className="num hide-sm">Registrado</th>
              <th className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => {
              const diff = Number(r.declared_cents) - Number(r.recorded_cents);
              const now = currentAtCutoff[r.id];
              return (
                <tr key={r.id}>
                  <td>
                    {formatDate(r.cutoff_date)}
                    <span className="sub">
                      {people[r.created_by ?? ""] ?? "—"}
                      {r.note ? ` · ${r.note}` : ""}
                      {r.document_id ? " · Con evidencia" : ""}
                    </span>
                    {r.stale && (
                      <span className="badge warn" style={{ marginTop: 4 }}>
                        Desactualizada: hoy el registrado a esa fecha es {formatCents(now)}
                      </span>
                    )}
                  </td>
                  <td className="num">{formatCents(r.declared_cents)}</td>
                  <td className="num hide-sm">{formatCents(r.recorded_cents)}</td>
                  <td className="num">
                    {diff === 0 ? <span className="badge ok">Saldo coincide</span> : <span className="badge critical">{formatCents(diff)} por revisar</span>}
                    {canWrite && (
                      <details style={{ textAlign: "left" }}>
                        <summary className="muted">Corregir</summary>
                        <ActionForm action={saveReview}>
                          <ReviewFields accountId={accountId} review={r} documents={documents} today={today} />
                          <SubmitButton className="secondary">Guardar corrección</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {canWrite && (
        <details>
          <summary>Nueva revisión de saldo</summary>
          <ActionForm action={saveReview}>
            <ReviewFields accountId={accountId} documents={documents} today={today} />
            <SubmitButton>Comparar y guardar</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

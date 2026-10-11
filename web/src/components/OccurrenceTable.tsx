import Link from "next/link";
import { formatDate } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { statusLabel, type Occurrence } from "@/lib/payments";

export function OccurrenceTable({ items, names, now }: { items: Occurrence[]; names: Record<string, string>; now: string }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Vence</th>
          <th>Concepto</th>
          <th className="hide-sm">Responsable</th>
          <th className="hide-sm">Estado</th>
          <th className="num">Importe</th>
        </tr>
      </thead>
      <tbody>
        {items.map((o) => {
          const s = statusLabel(o, now);
          return (
            <tr key={o.id}>
              <td className="muted">{formatDate(o.due_date)}</td>
              <td>
                <Link href={`/pagos/${o.id}`}>{o.concept}</Link>
                <span className="sub">
                  {o.kind === "card_payment" ? "Pago de tarjeta · " : ""}
                  {names[o.responsible_id ?? ""] ?? "Sin responsable"}
                </span>
              </td>
              <td className="hide-sm">{names[o.responsible_id ?? ""] ?? "—"}</td>
              <td className="hide-sm">
                <span className={`badge ${s.tone}`}>{s.text}</span>
              </td>
              <td className="num">
                {o.expected_cents ? `${o.is_estimate ? "≈ " : ""}${formatCents(o.expected_cents)}` : <span className="badge warn">Por confirmar</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

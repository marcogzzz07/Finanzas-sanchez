import { Plus } from "lucide-react";
import Link from "next/link";
import { formatDate, getBalances, today } from "@/lib/data";
import { TX_KINDS, type TxKind } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";

type Search = { mes?: string; cuenta?: string; tipo?: string; anulados?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, canWrite } = await requireMember();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : today().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  let query = supabase
    .from("transactions")
    .select("id, kind, concept, amount_cents, effective_date, status, account_id, to_account_id")
    .gte("effective_date", first)
    .lt("effective_date", next)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (sp.cuenta && /^[0-9a-f-]{36}$/i.test(sp.cuenta)) query = query.or(`account_id.eq.${sp.cuenta},to_account_id.eq.${sp.cuenta}`);
  if (sp.tipo && sp.tipo in TX_KINDS) query = query.eq("kind", sp.tipo);
  if (!sp.anulados) query = query.eq("status", "active");

  const [{ data: rows, error }, balances] = await Promise.all([query, getBalances(supabase)]);
  const names = Object.fromEntries(balances.map((b) => [b.account_id, b.name]));

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Movimientos</h1>
          <p>Ingresos, gastos, traspasos y devoluciones registrados.</p>
        </div>
        {canWrite && (
          <div className="actions">
            <Link className="button secondary" href="/movimientos/nuevo?tipo=transfer">Traspaso</Link>
            <Link className="button secondary" href="/movimientos/nuevo?tipo=income">Ingreso</Link>
            <Link className="button" href="/movimientos/nuevo?tipo=expense">
              <Plus size={16} aria-hidden /> Registrar gasto
            </Link>
          </div>
        )}
      </header>

      <form className="card filters" method="get">
        <label className="field">
          <span>Mes</span>
          <input type="month" name="mes" defaultValue={month} />
        </label>
        <label className="field">
          <span>Cuenta</span>
          <select name="cuenta" defaultValue={sp.cuenta ?? ""}>
            <option value="">Todas</option>
            {balances.map((b) => (
              <option key={b.account_id} value={b.account_id}>
                {b.name}
                {b.archived ? " (archivada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tipo</span>
          <select name="tipo" defaultValue={sp.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TX_KINDS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="anulados" value="1" defaultChecked={!!sp.anulados} />
          Ver anulados
        </label>
        <button className="secondary">Filtrar</button>
      </form>

      <section className="card">
        {error && <p className="error">{error.message}</p>}
        {(rows ?? []).length === 0 ? (
          <p>
            Todavía no hay movimientos en este mes.{" "}
            {canWrite && <Link href="/movimientos/nuevo?tipo=expense">Registra el primero</Link>}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th className="hide-sm">Cuenta</th>
                <th className="num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((t) => {
                const voided = t.status === "voided";
                return (
                  <tr key={t.id}>
                    <td className="muted">{formatDate(t.effective_date)}</td>
                    <td>
                      <Link href={`/movimientos/${t.id}`} className={voided ? "strike" : undefined}>
                        {t.concept}
                      </Link>
                      {voided && <span className="badge critical" style={{ marginLeft: 8 }}>Anulado</span>}
                      <span className="sub">{TX_KINDS[t.kind as TxKind]}</span>
                    </td>
                    <td className="hide-sm">
                      {names[t.account_id]}
                      {t.to_account_id ? ` → ${names[t.to_account_id]}` : ""}
                    </td>
                    <td className={`num ${voided ? "strike" : ""}`}>
                      {t.kind === "expense" ? "−" : t.kind === "income" || t.kind === "refund" ? "+" : ""}
                      {formatCents(t.amount_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { formatDate, getBalances, today } from "@/lib/data";
import { balanceLabel, TX_KINDS, type TxKind } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";

export default async function HomePage() {
  const { supabase, canWrite } = await requireMember();
  const [balances, month, recent] = await Promise.all([
    getBalances(supabase),
    supabase.rpc("month_summary").single<{ income_cents: number; expense_cents: number }>(),
    supabase
      .from("transactions")
      .select("id, kind, concept, amount_cents, effective_date, accounts!transactions_account_id_fkey(name)")
      .eq("status", "active")
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const active = balances.filter((b) => !b.archived);
  const liquid = active.filter((b) => b.available_for_payments && b.type !== "credit");
  const confirmed = liquid.filter((b) => b.has_opening);
  const pending = liquid.filter((b) => !b.has_opening);
  const liquidity = confirmed.reduce((s, b) => s + Number(b.balance_cents), 0);
  const investments = active.filter((b) => b.type === "investment" && !b.available_for_payments);
  const cards = active.filter((b) => b.type === "credit");
  const monthName = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(new Date(`${today()}T12:00:00`));

  return (
    <main>
      <h1>Inicio</h1>

      <section className="card soft">
        <div className="muted">Dinero registrado para pagos</div>
        <div className="stat">{formatCents(liquidity)}</div>
        <div className="muted">
          Según registros, en {confirmed.map((b) => b.name).join(", ") || "ninguna cuenta"}. La app no consulta al banco.
        </div>
        {pending.length > 0 && (
          <p className="badge warn">
            Sin saldo de arranque: {pending.map((b) => b.name).join(", ")}. Se completa con el primer estado de cuenta.
          </p>
        )}
      </section>

      {investments.length > 0 && (
        <section className="card">
          <div className="muted">Inversiones</div>
          <ul className="list">
            {investments.map((b) => (
              <li key={b.account_id} className="row">
                <span>{b.name}</span>
                <span className="num">{b.has_opening ? formatCents(b.balance_cents) : "Saldo por confirmar"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cards.length > 0 && (
        <section className="card">
          <div className="muted">Tarjetas de crédito</div>
          <ul className="list">
            {cards.map((b) => (
              <li key={b.account_id} className="row">
                <span>
                  {b.name} <span className="muted">· {balanceLabel(b.type, Number(b.balance_cents))}</span>
                </span>
                <span className="num">
                  {b.has_opening ? formatCents(Math.abs(Number(b.balance_cents))) : "Por confirmar"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="muted">Este mes ({monthName})</div>
        <div className="row">
          <span>Ingresos</span>
          <span className="num">{formatCents(month.data?.income_cents ?? 0)}</span>
        </div>
        <div className="row">
          <span>Gastos (menos devoluciones)</span>
          <span className="num">{formatCents(month.data?.expense_cents ?? 0)}</span>
        </div>
      </section>

      <section className="card">
        <div className="muted">Por pagar</div>
        <p>Los pagos pendientes y recurrentes llegan en el siguiente incremento.</p>
      </section>

      {canWrite && (
        <div className="actions">
          <Link className="button" href="/movimientos/nuevo?tipo=expense">
            Registrar gasto
          </Link>
          <Link className="button secondary" href="/movimientos/nuevo?tipo=income">
            Registrar ingreso
          </Link>
        </div>
      )}

      <h2>Últimos movimientos</h2>
      <section className="card">
        {(recent.data ?? []).length === 0 ? (
          <p>
            Todavía no hay movimientos.{" "}
            {canWrite && <Link href="/movimientos/nuevo?tipo=expense">Registra el primero</Link>}
          </p>
        ) : (
          <ul className="list">
            {(recent.data ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/movimientos/${t.id}`} className="row" style={{ textDecoration: "none", color: "inherit" }}>
                  <span>
                    {t.concept}
                    <br />
                    <span className="muted">
                      {TX_KINDS[t.kind as TxKind]} · {formatDate(t.effective_date)} ·{" "}
                      {(t.accounts as unknown as { name: string } | null)?.name}
                    </span>
                  </span>
                  <span className="num">{formatCents(t.amount_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

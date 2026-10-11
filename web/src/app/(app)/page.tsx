import { ArrowDownRight, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { BarChart } from "@/components/BarChart";
import { formatDate, getBalances, today } from "@/lib/data";
import { ACCOUNT_TYPES, balanceLabel, TX_KINDS, type TxKind } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";

const MONTHS = 6;

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Variación porcentual contra el mes anterior; null si no hay base. */
function change(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export default async function HomePage() {
  const { supabase, canWrite, profile } = await requireMember();
  const thisMonth = monthKey(today());
  const firstMonth = shiftMonth(thisMonth, -(MONTHS - 1));

  const [balances, history, recent] = await Promise.all([
    getBalances(supabase),
    supabase
      .from("transactions")
      .select("kind, amount_cents, effective_date")
      .eq("status", "active")
      .in("kind", ["income", "expense", "refund"])
      .gte("effective_date", `${firstMonth}-01`),
    supabase
      .from("transactions")
      .select("id, kind, concept, amount_cents, effective_date, account_id, to_account_id")
      .eq("status", "active")
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  // Ingresos y gastos (netos de devoluciones) por mes; traspasos excluidos.
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(firstMonth, i));
  const totals = Object.fromEntries(months.map((k) => [k, { income: 0, expense: 0 }]));
  for (const t of history.data ?? []) {
    const bucket = totals[monthKey(t.effective_date)];
    if (!bucket) continue;
    if (t.kind === "income") bucket.income += Number(t.amount_cents);
    else if (t.kind === "expense") bucket.expense += Number(t.amount_cents);
    else bucket.expense -= Number(t.amount_cents);
  }
  const now = totals[thisMonth];
  const prev = totals[shiftMonth(thisMonth, -1)] ?? { income: 0, expense: 0 };
  const incomeChange = change(now.income, prev.income);
  const expenseChange = change(now.expense, prev.expense);

  const active = balances.filter((b) => !b.archived);
  const liquid = active.filter((b) => b.available_for_payments && b.type !== "credit");
  const confirmed = liquid.filter((b) => b.has_opening);
  const pending = liquid.filter((b) => !b.has_opening);
  const liquidity = confirmed.reduce((s, b) => s + Number(b.balance_cents), 0);
  const cards = active.filter((b) => b.type === "credit");
  const cardDebt = cards.filter((b) => b.has_opening).reduce((s, b) => s + Number(b.balance_cents), 0);
  const names = Object.fromEntries(balances.map((b) => [b.account_id, b.name]));

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Hola, {profile.full_name || "bienvenida"}</h1>
          <p>Resumen de las cuentas y movimientos de la familia, según registros.</p>
        </div>
        {canWrite && (
          <div className="actions">
            <Link className="button secondary" href="/movimientos/nuevo?tipo=income">
              <Plus size={16} aria-hidden /> Ingreso
            </Link>
            <Link className="button" href="/movimientos/nuevo?tipo=expense">
              <Plus size={16} aria-hidden /> Registrar gasto
            </Link>
          </div>
        )}
      </header>

      <section className="grid grid-kpi" aria-label="Indicadores">
        <div className="card feature">
          <div className="label">Dinero registrado para pagos</div>
          <div className="stat">{formatCents(liquidity)}</div>
          <div className="muted">
            {confirmed.length > 0 ? confirmed.map((b) => b.name).join(" · ") : "Ninguna cuenta con saldo confirmado"}
          </div>
        </div>
        <div className="card">
          <div className="row">
            <span className="label">Ingresos de {monthName(thisMonth)}</span>
            {incomeChange !== null && (
              <span className={`badge ${incomeChange >= 0 ? "up" : "down"}`}>
                {incomeChange >= 0 ? "+" : ""}
                {incomeChange}%
              </span>
            )}
          </div>
          <div className="stat">{formatCents(now.income)}</div>
          <div className="muted">
            <ArrowUpRight size={14} aria-hidden /> vs. {formatCents(prev.income)} el mes pasado
          </div>
        </div>
        <div className="card">
          <div className="row">
            <span className="label">Gastos de {monthName(thisMonth)}</span>
            {expenseChange !== null && (
              <span className={`badge ${expenseChange <= 0 ? "up" : "down"}`}>
                {expenseChange >= 0 ? "+" : ""}
                {expenseChange}%
              </span>
            )}
          </div>
          <div className="stat">{formatCents(now.expense)}</div>
          <div className="muted">
            <ArrowDownRight size={14} aria-hidden /> netos de devoluciones · {formatCents(prev.expense)} el mes pasado
          </div>
        </div>
        <div className="card">
          <div className="label">Deuda de tarjetas</div>
          <div className="stat">{formatCents(Math.max(cardDebt, 0))}</div>
          <div className="muted">
            {cards.length === 0
              ? "Sin tarjetas de crédito"
              : cardDebt < 0
                ? `Saldo a favor de ${formatCents(-cardDebt)}`
                : cards.map((b) => b.name).join(" · ")}
          </div>
        </div>
      </section>

      {pending.length > 0 && (
        <p className="badge warn" style={{ marginTop: 16 }}>
          Saldo por confirmar en {pending.map((b) => b.name).join(", ")}: se completa con el primer estado de cuenta.
        </p>
      )}

      <section className="grid grid-main">
        <div className="card">
          <div className="card-head">
            <h3>Gastos por mes</h3>
            <span className="muted">Últimos {MONTHS} meses</span>
          </div>
          <BarChart
            ariaLabel="Gastos netos de devoluciones por mes"
            data={months.map((k) => ({ label: monthName(k, "short"), cents: Math.max(0, totals[k].expense), current: k === thisMonth }))}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Cuentas</h3>
            <Link href="/cuentas" className="muted">Ver todas</Link>
          </div>
          <ul className="list">
            {active.map((b) => (
              <li key={b.account_id}>
                <Link href={`/cuentas/${b.account_id}`} className="row">
                  <span>
                    <strong>{b.name}</strong>
                    <br />
                    <span className="muted">{ACCOUNT_TYPES[b.type]}</span>
                  </span>
                  {b.has_opening ? (
                    <span style={{ textAlign: "right" }}>
                      <span className="num">
                        {formatCents(b.type === "credit" ? Math.abs(Number(b.balance_cents)) : b.balance_cents)}
                      </span>
                      <br />
                      <span className="muted">{balanceLabel(b.type, Number(b.balance_cents))}</span>
                    </span>
                  ) : (
                    <span className="badge warn">Por confirmar</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-main">
        <div className="card">
          <div className="card-head">
            <h3>Últimos movimientos</h3>
            <Link href="/movimientos" className="muted">Ver todos</Link>
          </div>
          {(recent.data ?? []).length === 0 ? (
            <p>
              Todavía no hay movimientos.{" "}
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
                {(recent.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{formatDate(t.effective_date)}</td>
                    <td>
                      <Link href={`/movimientos/${t.id}`}>{t.concept}</Link>
                      <span className="sub">{TX_KINDS[t.kind as TxKind]}</span>
                    </td>
                    <td className="hide-sm">
                      {names[t.account_id]}
                      {t.to_account_id ? ` → ${names[t.to_account_id]}` : ""}
                    </td>
                    <td className="num">
                      {t.kind === "expense" ? "−" : t.kind === "income" || t.kind === "refund" ? "+" : ""}
                      {formatCents(t.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Por pagar</h3>
          </div>
          <p className="muted">
            Aquí aparecerán los pagos vencidos, de hoy y de los próximos siete días, con su responsable. Se habilita con el
            módulo de Pagos.
          </p>
        </div>
      </section>
    </main>
  );
}

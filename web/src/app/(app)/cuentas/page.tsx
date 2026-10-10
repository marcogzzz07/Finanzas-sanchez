import Link from "next/link";
import { getBalances } from "@/lib/data";
import { ACCOUNT_TYPES, balanceLabel } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";

export default async function AccountsPage() {
  const { supabase, canWrite } = await requireMember();
  const balances = await getBalances(supabase);
  const active = balances.filter((b) => !b.archived);
  const archived = balances.filter((b) => b.archived);

  const item = (b: (typeof balances)[number]) => (
    <li key={b.account_id}>
      <Link href={`/cuentas/${b.account_id}`} className="row" style={{ textDecoration: "none", color: "inherit" }}>
        <span>
          <strong>{b.name}</strong>
          <br />
          <span className="muted">
            {ACCOUNT_TYPES[b.type]}
            {b.institution_name ? ` · ${b.institution_name}` : ""}
            {b.responsible_name ? ` · ${b.responsible_name}` : ""}
            {b.available_for_payments ? " · Disponible para pagos" : ""}
          </span>
        </span>
        <span className="num" style={{ textAlign: "right" }}>
          {b.has_opening ? (
            <>
              {formatCents(b.type === "credit" ? Math.abs(Number(b.balance_cents)) : b.balance_cents)}
              <br />
              <span className="muted">{balanceLabel(b.type, Number(b.balance_cents))}</span>
            </>
          ) : (
            <span className="badge warn">Saldo por confirmar</span>
          )}
        </span>
      </Link>
    </li>
  );

  return (
    <main>
      <h1>Cuentas</h1>
      <p className="muted">Saldos según registros. La app no consulta al banco.</p>
      {canWrite && (
        <div className="actions">
          <Link className="button" href="/cuentas/nueva">Agregar cuenta</Link>
        </div>
      )}
      <section className="card">
        {active.length === 0 ? <p>No hay cuentas activas.</p> : <ul className="list">{active.map(item)}</ul>}
      </section>
      {archived.length > 0 && (
        <details>
          <summary>Archivadas ({archived.length})</summary>
          <section className="card">
            <ul className="list">{archived.map(item)}</ul>
          </section>
        </details>
      )}
    </main>
  );
}

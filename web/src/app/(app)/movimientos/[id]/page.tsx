import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getBalances, getCatalogs, getProfileNames, type Transaction } from "@/lib/data";
import { TX_KINDS } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";
import { TxForm } from "../TxForm";
import { VoidForm } from "./VoidForm";

export default async function TransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const { supabase, canWrite } = await requireMember();
  const { id } = await params;
  const { guardado } = await searchParams;
  const { data: tx } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle<Transaction>();
  if (!tx) notFound();

  const [balances, catalogs, people] = await Promise.all([
    getBalances(supabase),
    getCatalogs(supabase),
    getProfileNames(supabase),
  ]);
  const names = Object.fromEntries(balances.map((b) => [b.account_id, b.name]));
  const category = catalogs.categories.find((c) => c.id === tx.category_id);
  const voided = tx.status === "voided";
  // Al editar se pueden elegir cuentas activas y, además, las que ya tenía el movimiento.
  const accountOptions = balances
    .filter((b) => !b.archived || b.account_id === tx.account_id || b.account_id === tx.to_account_id)
    .map((b) => ({ id: b.account_id, name: b.name, type: b.type }));

  return (
    <main>
      <p>
        <Link href="/movimientos">← Movimientos</Link>
      </p>
      {guardado && <p className="notice">Guardado.</p>}

      <section className="card">
        <div className="muted">{TX_KINDS[tx.kind]}{voided ? " · Anulado" : ""}</div>
        <div className={`stat ${voided ? "strike" : ""}`}>{formatCents(tx.amount_cents)}</div>
        <p>
          <strong>{tx.concept}</strong>
          {tx.detail && <><br />{tx.detail}</>}
        </p>
        <p className="muted">
          {formatDate(tx.effective_date)} · {names[tx.account_id]}
          {tx.to_account_id ? ` → ${names[tx.to_account_id]}` : ""}
          {category ? ` · ${category.name}` : ""}
        </p>
        <p className="muted">
          Registró {people[tx.created_by ?? ""] ?? "—"} el {formatDate(tx.created_at)}
          {tx.updated_at !== tx.created_at && ` · Último cambio: ${people[tx.updated_by ?? ""] ?? "—"} el ${formatDate(tx.updated_at)}`}
        </p>
        {voided && <p className="error">Anulado: {tx.void_reason}</p>}
      </section>

      {canWrite && !voided && (
        <>
          <h2>Editar</h2>
          <div className="card">
            <TxForm
              initial={tx}
              accounts={accountOptions}
              categories={catalogs.categories.filter((c) => !c.archived || c.id === tx.category_id)}
              people={catalogs.people.filter((p) => !p.archived || p.id === tx.responsible_id)}
              labels={catalogs.labels.filter((l) => !l.archived || l.id === tx.label_id)}
            />
          </div>
          <h2>Anular</h2>
          <div className="card">
            <VoidForm id={tx.id} />
          </div>
        </>
      )}
    </main>
  );
}

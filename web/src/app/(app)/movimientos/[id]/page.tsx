import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getBalances, getCatalogs, getProfileNames, type Transaction } from "@/lib/data";
import { TX_KINDS } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";
import { UploadDocument } from "@/components/UploadDocument";
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

  const [balances, catalogs, people, receipts, payment, settings] = await Promise.all([
    getBalances(supabase),
    getCatalogs(supabase),
    getProfileNames(supabase),
    supabase.from("documents").select("id, file_name, archived").eq("transaction_id", id).order("created_at"),
    supabase.from("payment_occurrences").select("id, concept, due_date").eq("transaction_id", id).maybeSingle(),
    supabase.from("family_settings").select("max_upload_mb").eq("id", 1).single(),
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
        {payment.data && (
          <p>
            Salda el pago <Link href={`/pagos/${payment.data.id}`}>{payment.data.concept}</Link> del {formatDate(payment.data.due_date)}.
          </p>
        )}
      </section>

      <h2>Comprobantes</h2>
      <section className="card stack">
        {(receipts.data ?? []).length === 0 ? (
          <p className="muted">Sin comprobantes.</p>
        ) : (
          <ul className="list">
            {(receipts.data ?? []).map((d) => (
              <li key={d.id} className="row">
                <Link href={`/documentos/${d.id}`} className={d.archived ? "strike" : undefined}>{d.file_name}</Link>
                <a href={`/documentos/${d.id}/descargar`}>Descargar</a>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <details>
            <summary>Adjuntar comprobante</summary>
            <UploadDocument accounts={[]} maxMb={Number(settings.data?.max_upload_mb ?? 10)} defaultKind="receipt" transactionId={tx.id} compact />
          </details>
        )}
      </section>

      {canWrite && !voided && (
        <>
          <h2>Editar</h2>
          <div className="card form-narrow">
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
            <VoidForm id={tx.id} paymentConcept={payment.data?.concept} />
          </div>
        </>
      )}
    </main>
  );
}

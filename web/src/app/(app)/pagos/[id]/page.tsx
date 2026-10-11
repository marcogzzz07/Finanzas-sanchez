import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getBalances, getCatalogs, getProfileNames, today } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { addDays, OCCURRENCE_FIELDS, statusLabel, type Occurrence } from "@/lib/payments";
import { requireMember } from "@/lib/session";
import { PaymentForm } from "../PaymentForm";
import { CancelForm, DeleteOccurrenceForm, LinkPaymentForm, RegisterPaymentForm } from "./OccurrenceActions";

export default async function OccurrencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; pagado?: string; vinculado?: string }>;
}) {
  const { supabase, canWrite } = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await supabase.from("payment_occurrences").select(OCCURRENCE_FIELDS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as Occurrence;
  const now = today();

  const [catalogs, balances, people, tx] = await Promise.all([
    getCatalogs(supabase),
    getBalances(supabase),
    getProfileNames(supabase),
    o.transaction_id
      ? supabase.from("transactions").select("id, amount_cents, effective_date, account_id, to_account_id, concept").eq("id", o.transaction_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const accountNames = Object.fromEntries(balances.map((b) => [b.account_id, b.name]));
  const responsible = catalogs.people.find((p) => p.id === o.responsible_id)?.name;
  const category = catalogs.categories.find((c) => c.id === o.category_id)?.name;
  const status = statusLabel(o, now);

  // Movimientos compatibles sin vincular para "ya lo capturé".
  let candidates: { id: string; label: string }[] = [];
  if (canWrite && o.status === "pending") {
    let q = supabase
      .from("transactions")
      .select("id, concept, amount_cents, effective_date, to_account_id, kind")
      .eq("status", "active")
      .gte("effective_date", addDays(now, -60))
      .order("effective_date", { ascending: false })
      .limit(50);
    q = o.kind === "card_payment" ? q.eq("kind", "transfer").eq("to_account_id", o.card_account_id!) : q.eq("kind", "expense");
    const [{ data: txs }, { data: linked }] = await Promise.all([
      q,
      supabase.from("payment_occurrences").select("transaction_id").not("transaction_id", "is", null),
    ]);
    const used = new Set((linked ?? []).map((l) => l.transaction_id));
    candidates = (txs ?? [])
      .filter((t) => !used.has(t.id))
      .map((t) => ({ id: t.id, label: `${formatDate(t.effective_date)} · ${t.concept} · ${formatCents(t.amount_cents)}` }));
  }

  const payFrom = balances
    .filter((b) => !b.archived && (o.kind === "card_payment" ? b.type !== "credit" : true))
    .map((b) => ({ id: b.account_id, name: b.name }));

  return (
    <main>
      <p>
        <Link href="/pagos">← Pagos</Link>
      </p>
      {sp.guardado && <p className="notice">Pago guardado.</p>}
      {sp.pagado && <p className="notice">Pago registrado. Se creó el movimiento y el pendiente quedó como pagado.</p>}
      {sp.vinculado && <p className="notice">Pago vinculado al movimiento existente.</p>}

      <header className="pagehead">
        <div>
          <span className={`badge ${status.tone}`}>{status.text}</span>
          <h1 style={{ marginTop: 8 }}>{o.concept}</h1>
          <p>
            Vence el {formatDate(o.due_date)} · {responsible ?? "Sin responsable"}
            {o.kind === "card_payment" ? ` · Pago de tarjeta ${accountNames[o.card_account_id ?? ""] ?? ""}` : category ? ` · ${category}` : ""}
          </p>
        </div>
      </header>

      <section className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="label">Importe previsto</div>
          <div className="stat">
            {o.expected_cents ? formatCents(o.expected_cents) : "Por confirmar"}
          </div>
          <div className="muted">{o.is_estimate ? "Estimado" : o.expected_cents ? "Conocido" : "Se captura al pagar"}</div>
        </div>
        {tx.data && (
          <div className="card feature">
            <div className="label">Pagado</div>
            <div className="stat">{formatCents(tx.data.amount_cents)}</div>
            <div className="muted">
              {formatDate(tx.data.effective_date)} desde {accountNames[tx.data.account_id]} ·{" "}
              <Link href={`/movimientos/${tx.data.id}`} style={{ color: "white" }}>Ver movimiento</Link>
            </div>
          </div>
        )}
      </section>

      {o.rule_id && (
        <p className="muted">
          Este pago es parte de una serie. <Link href={`/pagos/reglas/${o.rule_id}`}>Ver o cambiar la serie</Link>
        </p>
      )}
      {o.status === "cancelled" && <p className="error">Cancelado: {o.cancel_reason}</p>}
      {o.status === "paid" && (
        <p className="muted">
          Para deshacer el pago, anula su movimiento: el pendiente regresa solo y los saldos se revierten.
        </p>
      )}

      {canWrite && o.status === "pending" && (
        <section className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <h3>Registrar pago</h3>
            </div>
            <RegisterPaymentForm id={o.id} expectedCents={o.expected_cents} accounts={payFrom} today={now} concept={o.concept} />
          </div>
          <div className="card">
            <div className="card-head">
              <h3>¿Ya lo capturaste?</h3>
            </div>
            <LinkPaymentForm id={o.id} candidates={candidates} />
          </div>
        </section>
      )}

      {canWrite && o.status === "pending" && (
        <>
          <h2>Cambiar solo este vencimiento</h2>
          <div className="card form-narrow">
            <PaymentForm
              mode="occurrence"
              initial={o}
              categories={catalogs.categories.filter((c) => (!c.archived && c.use !== "income") || c.id === o.category_id)}
              people={catalogs.people.filter((p) => !p.archived || p.id === o.responsible_id)}
              labels={catalogs.labels.filter((l) => !l.archived || l.id === o.label_id)}
              cards={balances.filter((b) => b.type === "credit").map((b) => ({ id: b.account_id, name: b.name }))}
            />
          </div>
        </>
      )}

      {canWrite && o.status !== "paid" && (
        <>
          <h2>Cancelar o eliminar</h2>
          <div className="card form-narrow stack">
            <CancelForm id={o.id} cancelled={o.status === "cancelled"} />
            {!o.rule_id && <DeleteOccurrenceForm id={o.id} />}
          </div>
        </>
      )}

      <p className="muted">Último cambio: {people[o.updated_by ?? ""] ?? "—"} el {formatDate(o.updated_at)}</p>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { OccurrenceTable } from "@/components/OccurrenceTable";
import { getBalances, getCatalogs, today } from "@/lib/data";
import { describeRule, OCCURRENCE_FIELDS, type Occurrence, type Rule } from "@/lib/payments";
import { requireMember } from "@/lib/session";
import { PaymentForm } from "../../PaymentForm";
import { RuleControls } from "./RuleControls";

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, canWrite } = await requireMember();
  const { id } = await params;
  const { data } = await supabase.from("recurrence_rules").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Rule;

  const [catalogs, balances, future, history] = await Promise.all([
    getCatalogs(supabase),
    getBalances(supabase),
    supabase.rpc("rule_future_pending", { p_rule: id }),
    supabase.from("payment_occurrences").select(OCCURRENCE_FIELDS).eq("rule_id", id).order("due_date", { ascending: false }).limit(30),
  ]);
  const names = Object.fromEntries(catalogs.people.map((p) => [p.id, p.name]));

  return (
    <main>
      <p>
        <Link href="/pagos?vista=reglas">← Pagos recurrentes</Link>
      </p>
      <header className="pagehead">
        <div>
          {!r.active && <span className="badge">Pausado</span>}
          <h1 style={{ marginTop: 8 }}>{r.concept}</h1>
          <p>{describeRule(r)}</p>
        </div>
      </header>

      {canWrite && (
        <>
          <h2>Cambiar la serie desde hoy</h2>
          <div className="card form-narrow">
            <PaymentForm
              mode="rule"
              futureCount={Number(future.data ?? 0)}
              initial={{
                ...r,
                due_date: r.start_date,
                frequency: r.frequency,
              }}
              categories={catalogs.categories.filter((c) => (!c.archived && c.use !== "income") || c.id === r.category_id)}
              people={catalogs.people.filter((p) => !p.archived || p.id === r.responsible_id)}
              labels={catalogs.labels.filter((l) => !l.archived || l.id === r.label_id)}
              cards={balances.filter((b) => b.type === "credit").map((b) => ({ id: b.account_id, name: b.name }))}
            />
          </div>
          <h2>Pausar o eliminar</h2>
          <div className="card form-narrow">
            <RuleControls id={r.id} active={r.active} />
          </div>
        </>
      )}

      <h2>Vencimientos de esta serie</h2>
      <section className="card">
        {(history.data ?? []).length === 0 ? (
          <p>Sin vencimientos generados.</p>
        ) : (
          <OccurrenceTable items={(history.data ?? []) as Occurrence[]} names={names} now={today()} />
        )}
      </section>
    </main>
  );
}

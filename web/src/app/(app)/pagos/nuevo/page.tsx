import { redirect } from "next/navigation";
import { getBalances, getCatalogs, today } from "@/lib/data";
import { requireMember } from "@/lib/session";
import { PaymentForm } from "../PaymentForm";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) redirect("/pagos");
  const { fecha } = await searchParams;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") ? fecha! : today();
  const [catalogs, balances] = await Promise.all([getCatalogs(supabase), getBalances(supabase)]);

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Agregar pago</h1>
          <p>Un pago único o una serie que se repite (por ejemplo, enfermeros sábado y domingo).</p>
        </div>
      </header>
      <div className="card form-narrow">
        <PaymentForm
          mode="new"
          initial={{ due_date: due, frequency: "none" }}
          categories={catalogs.categories.filter((c) => !c.archived && c.use !== "income")}
          people={catalogs.people.filter((p) => !p.archived)}
          labels={catalogs.labels.filter((l) => !l.archived)}
          cards={balances.filter((b) => b.type === "credit" && !b.archived).map((b) => ({ id: b.account_id, name: b.name }))}
        />
      </div>
    </main>
  );
}

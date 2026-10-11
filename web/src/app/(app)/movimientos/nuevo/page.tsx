import { redirect } from "next/navigation";
import { getBalances, getCatalogs, today } from "@/lib/data";
import { TX_KINDS, type TxKind } from "@/lib/labels";
import { requireMember } from "@/lib/session";
import { TxForm } from "../TxForm";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) redirect("/movimientos");
  const { tipo } = await searchParams;
  const kind: TxKind = tipo && tipo in TX_KINDS ? (tipo as TxKind) : "expense";
  const [balances, catalogs] = await Promise.all([getBalances(supabase), getCatalogs(supabase)]);

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Registrar {TX_KINDS[kind].toLowerCase()}</h1>
        </div>
      </header>
      <div className="card form-narrow">
        <TxForm
          initial={{ kind, effective_date: today() }}
          accounts={balances.filter((b) => !b.archived).map((b) => ({ id: b.account_id, name: b.name, type: b.type }))}
          categories={catalogs.categories.filter((c) => !c.archived)}
          people={catalogs.people.filter((p) => !p.archived)}
          labels={catalogs.labels.filter((l) => !l.archived)}
        />
      </div>
    </main>
  );
}

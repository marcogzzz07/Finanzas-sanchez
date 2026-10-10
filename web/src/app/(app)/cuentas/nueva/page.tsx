import { redirect } from "next/navigation";
import { getCatalogs } from "@/lib/data";
import { requireMember } from "@/lib/session";
import { AccountForm } from "../AccountForms";

export default async function NewAccountPage() {
  const { supabase, canWrite } = await requireMember();
  if (!canWrite) redirect("/cuentas");
  const { institutions, people } = await getCatalogs(supabase);
  return (
    <main>
      <h1>Agregar cuenta</h1>
      <div className="card">
        <AccountForm
          initial={{}}
          institutions={institutions.filter((i) => !i.archived)}
          people={people.filter((p) => !p.archived)}
        />
      </div>
    </main>
  );
}

import { requireMember } from "@/lib/session";

export default async function Page() {
  await requireMember();
  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Documentos</h1>
          <p>Estados de cuenta y comprobantes.</p>
        </div>
      </header>
      <div className="card">
        <p>Estados de cuenta y comprobantes en almacenamiento privado, con revisión de saldo a fecha de corte. Llega en el incremento 4.</p>
      </div>
    </main>
  );
}

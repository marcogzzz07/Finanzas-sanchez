import { requireMember } from "@/lib/session";

export default async function Page() {
  await requireMember();
  return (
    <main>
      <h1>Bandeja de estados de cuenta</h1>
      <div className="card">
        <p>Aquí subirás los PDF de Banorte, Bancrea u otro banco. La app los leerá, propondrá los movimientos, evitará duplicados y dejará cada cuenta al día. Si la cuenta no tiene saldo de arranque, lo tomará del primer estado. Llega en el incremento 5.</p>
      </div>
    </main>
  );
}

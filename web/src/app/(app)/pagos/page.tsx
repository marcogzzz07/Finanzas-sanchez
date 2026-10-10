import { requireMember } from "@/lib/session";

export default async function Page() {
  await requireMember();
  return (
    <main>
      <h1>Pagos</h1>
      <div className="card">
        <p>Pagos pendientes y recurrentes (enfermeros, servicios, predial, pago de tarjeta) con agenda por fecha. Llega en el incremento 3.</p>
      </div>
    </main>
  );
}

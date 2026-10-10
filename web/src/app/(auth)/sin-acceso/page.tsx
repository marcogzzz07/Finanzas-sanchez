import { signOut } from "../actions";

export default function NoAccessPage() {
  return (
    <main>
      <h1>Sin acceso</h1>
      <div className="card stack">
        <p>Tu usuario existe, pero todavía no tiene acceso activo. Pide a un administrador de la familia que lo active.</p>
        <form action={signOut}>
          <button className="secondary">Salir</button>
        </form>
      </div>
    </main>
  );
}

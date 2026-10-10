import { LoginForm } from "../AuthForms";

export default function LoginPage() {
  return (
    <main>
      <h1>Finanzas familiares</h1>
      <p className="muted">Acceso solo para personas invitadas.</p>
      <div className="card">
        <LoginForm />
      </div>
    </main>
  );
}

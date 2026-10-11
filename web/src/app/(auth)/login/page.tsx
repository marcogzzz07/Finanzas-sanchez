import { LoginForm } from "../AuthForms";

export default function LoginPage() {
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-mark" aria-hidden>F</span>
        <span>Finanzas familiares</span>
      </div>
      <h1>Entrar</h1>
      <p className="muted">Acceso solo para personas invitadas.</p>
      <div className="card">
        <LoginForm />
      </div>
    </main>
  );
}

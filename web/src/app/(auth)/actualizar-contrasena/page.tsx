import { NewPasswordForm } from "../AuthForms";

export default function NewPasswordPage() {
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-mark" aria-hidden>F</span>
        <span>Finanzas familiares</span>
      </div>
      <h1>Crea tu contraseña</h1>
      <div className="card">
        <NewPasswordForm />
      </div>
    </main>
  );
}

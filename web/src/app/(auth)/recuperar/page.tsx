import { ResetForm } from "../AuthForms";

export default function RecoverPage() {
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-mark" aria-hidden>F</span>
        <span>Finanzas familiares</span>
      </div>
      <h1>Recuperar acceso</h1>
      <div className="card">
        <ResetForm />
      </div>
    </main>
  );
}

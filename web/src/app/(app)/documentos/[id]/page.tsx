import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { UploadDocument } from "@/components/UploadDocument";
import { formatDate, getBalances, getProfileNames } from "@/lib/data";
import { DOC_KINDS } from "@/lib/labels";
import { requireMember } from "@/lib/session";
import { deleteDocument, setDocumentArchived, updateDocument } from "../actions";

type Doc = {
  id: string;
  kind: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  account_id: string | null;
  transaction_id: string | null;
  period_start: string | null;
  period_end: string | null;
  cutoff_date: string | null;
  notes: string | null;
  archived: boolean;
  replaces_id: string | null;
  created_by: string | null;
  created_at: string;
};

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, canWrite } = await requireMember();
  const { id } = await params;
  const { data } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as Doc;

  const [balances, people, links, settings, replacement] = await Promise.all([
    getBalances(supabase),
    getProfileNames(supabase),
    supabase.rpc("document_links", { p_id: id }),
    supabase.from("family_settings").select("max_upload_mb").eq("id", 1).single(),
    supabase.from("documents").select("id, file_name").eq("replaces_id", id).maybeSingle(),
  ]);
  const linkCount = Number(links.data ?? 0);
  const accounts = balances.filter((b) => !b.archived || b.account_id === d.account_id).map((b) => ({ id: b.account_id, name: b.name }));

  return (
    <main>
      <p>
        <Link href="/documentos">← Documentos</Link>
      </p>
      <header className="pagehead">
        <div>
          <span className="badge">{DOC_KINDS[d.kind]}</span>
          {d.archived && <span className="badge" style={{ marginLeft: 6 }}>Retirado</span>}
          <h1 style={{ marginTop: 8 }}>{d.file_name}</h1>
          <p>
            Subido por {people[d.created_by ?? ""] ?? "—"} el {formatDate(d.created_at)} · {(d.size_bytes / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <div className="actions">
          <a className="button" href={`/documentos/${d.id}/descargar`}>
            <Download size={16} aria-hidden /> Descargar
          </a>
        </div>
      </header>

      {d.transaction_id && (
        <p>
          Respalda un <Link href={`/movimientos/${d.transaction_id}`}>movimiento</Link>.
        </p>
      )}
      {replacement.data && (
        <p className="notice">
          Reemplazado por <Link href={`/documentos/${replacement.data.id}`}>{replacement.data.file_name}</Link>.
        </p>
      )}

      {canWrite && (
        <section className="grid grid-main">
          <div className="card">
            <div className="card-head">
              <h3>Corregir datos</h3>
            </div>
            <ActionForm action={updateDocument}>
              <input type="hidden" name="id" value={d.id} />
              <label>
                <span>Nombre</span>
                <input name="file_name" defaultValue={d.file_name} required />
              </label>
              <label>
                <span>Tipo</span>
                <select name="kind" defaultValue={d.kind}>
                  {Object.entries(DOC_KINDS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cuenta</span>
                <select name="account_id" defaultValue={d.account_id ?? ""}>
                  <option value="">Sin cuenta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <div className="filters">
                <label className="field">
                  <span>Periodo desde</span>
                  <input type="date" name="period_start" defaultValue={d.period_start ?? ""} />
                </label>
                <label className="field">
                  <span>Periodo hasta</span>
                  <input type="date" name="period_end" defaultValue={d.period_end ?? ""} />
                </label>
                <label className="field">
                  <span>Fecha de corte</span>
                  <input type="date" name="cutoff_date" defaultValue={d.cutoff_date ?? ""} />
                </label>
              </div>
              <label>
                <span>Notas</span>
                <input name="notes" defaultValue={d.notes ?? ""} />
              </label>
              <SubmitButton>Guardar</SubmitButton>
            </ActionForm>
          </div>

          <div>
            {!replacement.data && (
              <div className="card">
                <div className="card-head">
                  <h3>Subir reemplazo</h3>
                </div>
                <p className="muted">La versión actual se retira y se conserva como historial.</p>
                <UploadDocument
                  accounts={accounts}
                  maxMb={Number(settings.data?.max_upload_mb ?? 10)}
                  defaultKind={d.kind as "statement" | "receipt" | "other"}
                  defaultAccountId={d.account_id}
                  transactionId={d.transaction_id ?? undefined}
                  replacesId={d.id}
                  compact={!!d.transaction_id}
                />
              </div>
            )}
            <div className="card stack">
              <div className="card-head" style={{ marginBottom: 0 }}>
                <h3>Retirar</h3>
              </div>
              <ActionForm action={setDocumentArchived}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="archived" value={String(!d.archived)} />
                <SubmitButton className="secondary">{d.archived ? "Restaurar" : "Retirar documento"}</SubmitButton>
              </ActionForm>
              {linkCount === 0 ? (
                <ActionForm action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton className="danger" confirm="Se eliminará el archivo definitivamente. ¿Continuar?">
                    Eliminar archivo
                  </SubmitButton>
                </ActionForm>
              ) : (
                <p className="muted">
                  Respalda {linkCount} registro(s), así que no se elimina: retíralo para conservar el historial.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

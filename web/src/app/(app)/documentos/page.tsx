import { Download } from "lucide-react";
import Link from "next/link";
import { UploadDocument } from "@/components/UploadDocument";
import { formatDate, getBalances, getProfileNames } from "@/lib/data";
import { DOC_KINDS } from "@/lib/labels";
import { requireMember } from "@/lib/session";

type Doc = {
  id: string;
  kind: string;
  file_name: string;
  size_bytes: number;
  account_id: string | null;
  transaction_id: string | null;
  period_start: string | null;
  period_end: string | null;
  cutoff_date: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
};

type Search = { cuenta?: string; tipo?: string; retirados?: string; eliminado?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, canWrite } = await requireMember();
  const sp = await searchParams;

  let q = supabase
    .from("documents")
    .select("id, kind, file_name, size_bytes, account_id, transaction_id, period_start, period_end, cutoff_date, archived, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.cuenta && /^[0-9a-f-]{36}$/i.test(sp.cuenta)) q = q.eq("account_id", sp.cuenta);
  if (sp.tipo && sp.tipo in DOC_KINDS) q = q.eq("kind", sp.tipo);
  if (!sp.retirados) q = q.eq("archived", false);

  const [{ data }, balances, people, settings] = await Promise.all([
    q,
    getBalances(supabase),
    getProfileNames(supabase),
    supabase.from("family_settings").select("max_upload_mb").eq("id", 1).single(),
  ]);
  const docs = (data ?? []) as Doc[];
  const names = Object.fromEntries(balances.map((b) => [b.account_id, b.name]));

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Documentos</h1>
          <p>Estados de cuenta y comprobantes en almacenamiento privado. Subirlos no cambia saldos.</p>
        </div>
      </header>
      {sp.eliminado && <p className="notice">Documento eliminado.</p>}

      <section className="grid grid-main">
        <div className="card">
          <form className="filters" method="get" style={{ marginBottom: 16 }}>
            <label className="field">
              <span>Cuenta</span>
              <select name="cuenta" defaultValue={sp.cuenta ?? ""}>
                <option value="">Todas</option>
                {balances.map((b) => (
                  <option key={b.account_id} value={b.account_id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select name="tipo" defaultValue={sp.tipo ?? ""}>
                <option value="">Todos</option>
                {Object.entries(DOC_KINDS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="retirados" value="1" defaultChecked={!!sp.retirados} />
              Ver retirados
            </label>
            <button className="secondary">Filtrar</button>
          </form>

          {docs.length === 0 ? (
            <p>Todavía no hay documentos.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th className="hide-sm">Cuenta</th>
                  <th className="hide-sm">Periodo</th>
                  <th className="num">Descargar</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/documentos/${d.id}`} className={d.archived ? "strike" : undefined}>{d.file_name}</Link>
                      {d.archived && <span className="badge" style={{ marginLeft: 8 }}>Retirado</span>}
                      <span className="sub">
                        {DOC_KINDS[d.kind]} · {people[d.created_by ?? ""] ?? "—"} · {formatDate(d.created_at)}
                        {d.transaction_id ? " · Respalda un movimiento" : ""}
                      </span>
                    </td>
                    <td className="hide-sm">{names[d.account_id ?? ""] ?? "—"}</td>
                    <td className="hide-sm muted">
                      {d.period_start && d.period_end
                        ? `${formatDate(d.period_start)} – ${formatDate(d.period_end)}`
                        : d.cutoff_date
                          ? `Corte ${formatDate(d.cutoff_date)}`
                          : "—"}
                    </td>
                    <td className="num">
                      <a href={`/documentos/${d.id}/descargar`} aria-label={`Descargar ${d.file_name}`}>
                        <Download size={18} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canWrite && (
          <div className="card">
            <div className="card-head">
              <h3>Subir documento</h3>
            </div>
            <UploadDocument
              accounts={balances.filter((b) => !b.archived).map((b) => ({ id: b.account_id, name: b.name }))}
              maxMb={Number(settings.data?.max_upload_mb ?? 10)}
            />
          </div>
        )}
      </section>
    </main>
  );
}

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { getCatalogs } from "@/lib/data";
import { CATEGORY_USES, LABEL_KINDS, ROLES } from "@/lib/labels";
import { requireMember } from "@/lib/session";
import { signOut } from "../../(auth)/actions";
import {
  inviteUser,
  removeCatalogItem,
  saveCatalogItem,
  saveSettings,
  setAccess,
  setCatalogArchived,
  updateMyProfile,
} from "./actions";

type Item = { id: string; name: string; archived: boolean; use?: string; kind?: string; user_id?: string | null };
type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: keyof typeof ROLES;
  active: boolean;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
};

const SECTIONS = [
  { table: "institutions", title: "Bancos e instituciones", noun: "banco" },
  { table: "responsible_people", title: "Personas responsables", noun: "persona" },
  { table: "categories", title: "Categorías", noun: "categoría" },
  { table: "reference_labels", title: "Inmuebles y beneficiarios", noun: "etiqueta" },
] as const;

export default async function SettingsPage() {
  const { supabase, profile, email, canWrite, isAdmin } = await requireMember();
  const catalogs = await getCatalogs(supabase);
  const lists: Record<string, Item[]> = {
    institutions: catalogs.institutions,
    responsible_people: catalogs.people,
    categories: catalogs.categories,
    reference_labels: catalogs.labels,
  };

  const counts: Record<string, number> = {};
  await Promise.all(
    SECTIONS.flatMap((s) =>
      lists[s.table].map(async (item) => {
        const { data } = await supabase.rpc("reference_count", { p_catalog: s.table, p_id: item.id });
        counts[item.id] = Number(data ?? 0);
      }),
    ),
  );

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, active").order("full_name");
  const members = (profiles ?? []).filter((p) => p.active);

  let users: UserRow[] = [];
  let settings: Record<string, unknown> | null = null;
  if (isAdmin) {
    const [u, s] = await Promise.all([
      supabase.rpc("admin_list_users"),
      supabase.from("family_settings").select("*").eq("id", 1).single(),
    ]);
    users = (u.data ?? []) as UserRow[];
    settings = s.data;
  }

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Configuración</h1>
          <p>Catálogos, usuarios y avisos.</p>
        </div>
      </header>

      <h2>Mi perfil</h2>
      <div className="card">
        <ActionForm action={updateMyProfile}>
          <p className="muted">
            {email} · {ROLES[profile.role]}
          </p>
          <label>
            <span>Nombre</span>
            <input name="full_name" defaultValue={profile.full_name} />
          </label>
          <label className="check">
            <input type="checkbox" name="email_opt_in" defaultChecked={profile.email_opt_in} />
            Recibir correos de pagos por revisar
          </label>
          <SubmitButton>Guardar</SubmitButton>
        </ActionForm>
        <form action={signOut} style={{ marginTop: 12 }}>
          <button className="secondary">Salir</button>
        </form>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.table}>
          <h2>{s.title}</h2>
          <div className="card">
            <ul className="list">
              {lists[s.table].length === 0 && <li className="muted">Sin elementos.</li>}
              {lists[s.table].map((item) => {
                const refs = counts[item.id] ?? 0;
                const others = lists[s.table].filter(
                  (o) => o.id !== item.id && !o.archived && (s.table !== "categories" || o.use === item.use || o.use === "both"),
                );
                return (
                  <li key={item.id}>
                    <details>
                      <summary>
                        {item.name}
                        {item.archived && <span className="badge"> Archivado</span>}
                        <span className="muted"> · {refs} uso(s)</span>
                      </summary>
                      {canWrite ? (
                        <div className="stack">
                          <ActionForm action={saveCatalogItem}>
                            <input type="hidden" name="table" value={s.table} />
                            <input type="hidden" name="id" value={item.id} />
                            <label>
                              <span>Nombre</span>
                              <input name="name" defaultValue={item.name} required />
                            </label>
                            <CatalogExtraFields table={s.table} item={item} members={members} />
                            <SubmitButton>Guardar</SubmitButton>
                          </ActionForm>
                          <ActionForm action={setCatalogArchived}>
                            <input type="hidden" name="table" value={s.table} />
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="archived" value={String(!item.archived)} />
                            <SubmitButton className="secondary">{item.archived ? "Reactivar" : "Archivar"}</SubmitButton>
                          </ActionForm>
                          <ActionForm action={removeCatalogItem}>
                            <input type="hidden" name="table" value={s.table} />
                            <input type="hidden" name="id" value={item.id} />
                            {refs > 0 && (
                              <label>
                                <span>Está en uso en {refs} registro(s). Para eliminarlo, pásalos a:</span>
                                <select name="reassign_to" required>
                                  <option value="">Elige…</option>
                                  {others.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <SubmitButton className="danger" confirm={`¿Eliminar "${item.name}"?`}>
                              {refs > 0 ? "Reasignar y eliminar" : "Eliminar"}
                            </SubmitButton>
                          </ActionForm>
                        </div>
                      ) : (
                        <p className="muted">Solo lectura.</p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
            {canWrite && (
              <details>
                <summary>Agregar {s.noun}</summary>
                <ActionForm action={saveCatalogItem}>
                  <input type="hidden" name="table" value={s.table} />
                  <label>
                    <span>Nombre</span>
                    <input name="name" required />
                  </label>
                  <CatalogExtraFields table={s.table} members={members} />
                  <SubmitButton>Agregar</SubmitButton>
                </ActionForm>
              </details>
            )}
          </div>
        </section>
      ))}

      {isAdmin && (
        <>
          <h2>Usuarios y accesos</h2>
          <div className="card">
            <ul className="list">
              {users.map((u) => (
                <li key={u.id}>
                  <details>
                    <summary>
                      {u.full_name || u.email} <span className="muted">· {ROLES[u.role]}</span>
                      {!u.active && <span className="badge warn"> Sin acceso</span>}
                    </summary>
                    <ActionForm action={setAccess}>
                      <p className="muted">
                        {u.email}
                        {!u.email_confirmed && " · Invitación sin aceptar"}
                      </p>
                      <input type="hidden" name="user_id" value={u.id} />
                      <label>
                        <span>Nombre</span>
                        <input name="full_name" defaultValue={u.full_name} />
                      </label>
                      <label>
                        <span>Rol</span>
                        <select name="role" defaultValue={u.role}>
                          {Object.entries(ROLES).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="check">
                        <input type="checkbox" name="active" defaultChecked={u.active} />
                        Acceso activo (si lo quitas, deja de ver y descargar datos de inmediato)
                      </label>
                      <SubmitButton>Guardar acceso</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
            <details>
              <summary>Invitar a una persona</summary>
              <ActionForm action={inviteUser}>
                <label>
                  <span>Correo</span>
                  <input name="email" type="email" required />
                </label>
                <label>
                  <span>Nombre</span>
                  <input name="full_name" />
                </label>
                <label>
                  <span>Rol</span>
                  <select name="role" defaultValue="editor">
                    {Object.entries(ROLES).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
                <SubmitButton>Enviar invitación</SubmitButton>
              </ActionForm>
            </details>
          </div>

          <h2>Avisos y ajustes globales</h2>
          <div className="card">
            <ActionForm action={saveSettings}>
              <label>
                <span>Hora del resumen diario (hora de {String(settings?.timezone ?? "Monterrey")})</span>
                <input type="number" name="digest_hour" min={0} max={23} defaultValue={Number(settings?.digest_hour ?? 8)} />
              </label>
              <label>
                <span>Días de anticipación</span>
                <input type="number" name="lead_days" min={0} max={30} defaultValue={Number(settings?.lead_days ?? 3)} />
              </label>
              <label>
                <span>Destinataria del resumen global</span>
                <select name="global_recipient_id" defaultValue={String(settings?.global_recipient_id ?? "")}>
                  <option value="">Sin asignar</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || "Sin nombre"}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tamaño máximo por archivo (MB)</span>
                <input type="number" name="max_upload_mb" min={1} max={50} defaultValue={Number(settings?.max_upload_mb ?? 10)} />
              </label>
              <p className="muted">El envío de correos se activa en el incremento de avisos; por ahora estos valores solo se guardan.</p>
              <SubmitButton>Guardar ajustes</SubmitButton>
            </ActionForm>
          </div>
        </>
      )}
    </main>
  );
}

function CatalogExtraFields({
  table,
  item,
  members,
}: {
  table: string;
  item?: Item;
  members: { id: string; full_name: string }[];
}) {
  if (table === "categories") {
    return (
      <label>
        <span>Se usa en</span>
        <select name="use" defaultValue={item?.use ?? "expense"}>
          {Object.entries(CATEGORY_USES).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (table === "reference_labels") {
    return (
      <label>
        <span>Clase</span>
        <select name="kind" defaultValue={item?.kind ?? "property"}>
          {Object.entries(LABEL_KINDS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (table === "responsible_people") {
    return (
      <label>
        <span>Usuario vinculado (para recibir sus avisos)</span>
        <select name="user_id" defaultValue={item?.user_id ?? ""}>
          <option value="">Sin usuario</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name || "Sin nombre"}</option>
          ))}
        </select>
      </label>
    );
  }
  return null;
}

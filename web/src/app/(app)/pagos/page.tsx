import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { getCatalogs, today } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { OccurrenceTable } from "@/components/OccurrenceTable";
import { addDays, describeRule, ensureOccurrences, OCCURRENCE_FIELDS, type Occurrence, type Rule } from "@/lib/payments";
import { requireMember } from "@/lib/session";

type Search = { vista?: string; responsable?: string; guardado?: string };

const VIEWS = [
  { key: "pendientes", label: "Por pagar" },
  { key: "pagados", label: "Pagados" },
  { key: "cancelados", label: "Cancelados" },
  { key: "reglas", label: "Pagos recurrentes" },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, canWrite } = await requireMember();
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.vista) ? sp.vista! : "pendientes";
  const now = today();
  await ensureOccurrences(supabase);
  const { people } = await getCatalogs(supabase);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));

  let occurrences: Occurrence[] = [];
  let rules: Rule[] = [];
  if (view === "reglas") {
    const { data } = await supabase.from("recurrence_rules").select("*").order("active", { ascending: false }).order("concept");
    rules = (data ?? []) as Rule[];
  } else {
    const status = view === "pagados" ? "paid" : view === "cancelados" ? "cancelled" : "pending";
    let q = supabase.from("payment_occurrences").select(OCCURRENCE_FIELDS).eq("status", status);
    if (status === "pending") q = q.lte("due_date", addDays(now, 60)).order("due_date");
    else q = q.order("due_date", { ascending: false }).limit(100);
    if (sp.responsable && /^[0-9a-f-]{36}$/i.test(sp.responsable)) q = q.eq("responsible_id", sp.responsable);
    const { data } = await q;
    occurrences = (data ?? []) as Occurrence[];
  }

  // Agrupar pendientes: vencidos, hoy, próximos 7 días, más adelante.
  const groups =
    view === "pendientes"
      ? [
          { title: "Vencidos", items: occurrences.filter((o) => o.due_date < now) },
          { title: "Hoy", items: occurrences.filter((o) => o.due_date === now) },
          { title: "Próximos 7 días", items: occurrences.filter((o) => o.due_date > now && o.due_date <= addDays(now, 7)) },
          { title: "Más adelante", items: occurrences.filter((o) => o.due_date > addDays(now, 7)) },
        ]
      : [{ title: "", items: occurrences }];

  const week = occurrences.filter((o) => o.due_date <= addDays(now, 7));
  const knownTotal = week.reduce((s, o) => s + Number(o.expected_cents ?? 0), 0);
  const unknown = week.filter((o) => o.expected_cents === null).length;

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Pagos</h1>
          <p>Pendientes, recurrentes y quién se encarga.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/calendario">
            <CalendarDays size={16} aria-hidden /> Calendario
          </Link>
          {canWrite && (
            <Link className="button" href="/pagos/nuevo">
              <Plus size={16} aria-hidden /> Agregar pago
            </Link>
          )}
        </div>
      </header>

      {sp.guardado && <p className="notice">Pago guardado.</p>}

      {view === "pendientes" && (
        <section className="grid grid-kpi" style={{ marginBottom: 16 }}>
          <div className="card feature">
            <div className="label">Por pagar hasta en 7 días</div>
            <div className="stat">{formatCents(knownTotal)}</div>
            <div className="muted">
              {week.length} pago(s){unknown > 0 ? ` · ${unknown} con importe por confirmar (no se suman)` : ""}
            </div>
          </div>
          <div className="card">
            <div className="label">Vencidos</div>
            <div className="stat">{groups[0].items.length}</div>
            <div className="muted">Pendientes con fecha anterior a hoy</div>
          </div>
        </section>
      )}

      <nav className="pills" aria-label="Vista" style={{ marginBottom: 16 }}>
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/pagos?vista=${v.key}`} className={`pill ${view === v.key ? "active" : ""}`}>
            {v.label}
          </Link>
        ))}
      </nav>

      {view !== "reglas" && (
        <form className="filters" method="get" style={{ marginBottom: 16 }}>
          <input type="hidden" name="vista" value={view} />
          <label className="field">
            <span>Responsable</span>
            <select name="responsable" defaultValue={sp.responsable ?? ""}>
              <option value="">Todas las personas</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <button className="secondary">Filtrar</button>
        </form>
      )}

      {view === "reglas" ? (
        <section className="card">
          {rules.length === 0 ? (
            <p>No hay pagos recurrentes. {canWrite && <Link href="/pagos/nuevo">Agrega uno</Link>}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="hide-sm">Repetición</th>
                  <th className="hide-sm">Responsable</th>
                  <th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/pagos/reglas/${r.id}`}>{r.concept}</Link>
                      {!r.active && <span className="badge" style={{ marginLeft: 8 }}>Pausado</span>}
                      <span className="sub">{describeRule(r)}</span>
                    </td>
                    <td className="hide-sm">{describeRule(r)}</td>
                    <td className="hide-sm">{names[r.responsible_id ?? ""] ?? "—"}</td>
                    <td className="num">{r.expected_cents ? `${r.is_estimate ? "≈ " : ""}${formatCents(r.expected_cents)}` : "Por confirmar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        groups.map(
          (g) =>
            (g.items.length > 0 || (!g.title && occurrences.length === 0)) && (
              <section key={g.title || "all"} className="card">
                {g.title && (
                  <div className="card-head">
                    <h3>{g.title}</h3>
                    <span className="muted">{g.items.length}</span>
                  </div>
                )}
                {g.items.length === 0 ? (
                  <p>Nada por aquí.</p>
                ) : (
                  <OccurrenceTable items={g.items} names={names} now={now} />
                )}
              </section>
            ),
        )
      )}
      {view === "pendientes" && occurrences.length === 0 && (
        <section className="card">
          <p>No hay pagos pendientes en los próximos 60 días. {canWrite && <Link href="/pagos/nuevo">Agrega uno</Link>}</p>
        </section>
      )}
    </main>
  );
}

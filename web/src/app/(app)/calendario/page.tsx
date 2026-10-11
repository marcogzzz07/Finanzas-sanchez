import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { getCatalogs, today } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { addDays, MONTHS, OCCURRENCE_FIELDS, statusLabel, type Occurrence } from "@/lib/payments";
import { requireMember } from "@/lib/session";

const WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ mes?: string; responsable?: string }> }) {
  const { supabase, canWrite } = await requireMember();
  const sp = await searchParams;
  const now = today();
  const thisMonth = now.slice(0, 7);
  let month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : thisMonth;
  // Límite razonable para generar series hacia adelante.
  if (month > shiftMonth(thisMonth, 18)) month = shiftMonth(thisMonth, 18);

  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const gridStart = addDays(first, -lead);
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridEnd = addDays(gridStart, cells - 1);

  // Asegura que las series tengan sus vencimientos hasta el mes que se ve.
  await supabase.rpc("generate_occurrences", { p_until: gridEnd > addDays(now, 60) ? gridEnd : null });

  let q = supabase
    .from("payment_occurrences")
    .select(OCCURRENCE_FIELDS)
    .gte("due_date", gridStart)
    .lte("due_date", gridEnd)
    .order("due_date");
  if (sp.responsable && /^[0-9a-f-]{36}$/i.test(sp.responsable)) q = q.eq("responsible_id", sp.responsable);
  const [{ data }, { people }] = await Promise.all([q, getCatalogs(supabase)]);
  const items = (data ?? []) as Occurrence[];
  const byDay = new Map<string, Occurrence[]>();
  for (const o of items) byDay.set(o.due_date, [...(byDay.get(o.due_date) ?? []), o]);

  const inMonth = items.filter((o) => o.due_date >= first && o.due_date <= last);
  const pending = inMonth.filter((o) => o.status === "pending");
  const pendingKnown = pending.reduce((s, o) => s + Number(o.expected_cents ?? 0), 0);
  const pendingUnknown = pending.filter((o) => o.expected_cents === null).length;
  const paidCount = inMonth.filter((o) => o.status === "paid").length;
  const filter = sp.responsable ? `&responsable=${sp.responsable}` : "";

  return (
    <main>
      <header className="pagehead">
        <div>
          <h1>Calendario de pagos</h1>
          <p>Lo que hay que pagar cada mes y quién se encarga.</p>
        </div>
        {canWrite && (
          <div className="actions">
            <Link className="button" href="/pagos/nuevo">
              <Plus size={16} aria-hidden /> Agregar pago
            </Link>
          </div>
        )}
      </header>

      <section className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card feature">
          <div className="label">Por pagar en {MONTHS[m - 1]}</div>
          <div className="stat">{formatCents(pendingKnown)}</div>
          <div className="muted">
            {pending.length} pendiente(s){pendingUnknown ? ` · ${pendingUnknown} por confirmar` : ""}
          </div>
        </div>
        <div className="card">
          <div className="label">Pagados en {MONTHS[m - 1]}</div>
          <div className="stat">{paidCount}</div>
          <div className="muted">de {inMonth.filter((o) => o.status !== "cancelled").length} pagos del mes</div>
        </div>
      </section>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link className="button secondary" href={`/calendario?mes=${shiftMonth(month, -1)}${filter}`} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </Link>
          <h2 className="cal-title">
            {MONTHS[m - 1]} {y}
          </h2>
          <Link className="button secondary" href={`/calendario?mes=${shiftMonth(month, 1)}${filter}`} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </Link>
          {month !== thisMonth && (
            <Link className="button secondary" href={`/calendario${sp.responsable ? `?responsable=${sp.responsable}` : ""}`}>
              Hoy
            </Link>
          )}
        </div>
        <form method="get" className="cal-filter">
          <input type="hidden" name="mes" value={month} />
          <select name="responsable" defaultValue={sp.responsable ?? ""} aria-label="Responsable">
            <option value="">Todas las personas</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="secondary">Filtrar</button>
        </form>
      </div>

      <section className="card cal" aria-label={`Calendario de ${MONTHS[m - 1]} ${y}`}>
        <div className="cal-grid">
          {WEEK.map((d) => (
            <div key={d} className="cal-head">{d}</div>
          ))}
          {Array.from({ length: cells }, (_, i) => {
            const day = addDays(gridStart, i);
            const outside = day < first || day > last;
            const list = byDay.get(day) ?? [];
            return (
              <div key={day} className={`cal-cell ${outside ? "outside" : ""} ${day === now ? "today" : ""}`}>
                <div className="cal-day">
                  <span>{Number(day.slice(8))}</span>
                  {canWrite && !outside && (
                    <Link href={`/pagos/nuevo?fecha=${day}`} className="cal-add" aria-label={`Agregar pago el ${day}`}>
                      <Plus size={14} />
                    </Link>
                  )}
                </div>
                {list.map((o) => {
                  const s = statusLabel(o, now);
                  return (
                    <Link key={o.id} href={`/pagos/${o.id}`} className={`cal-item ${o.status} ${s.tone}`} title={`${o.concept} · ${s.text}`}>
                      <span className="cal-concept">{o.concept}</span>
                      <span className="cal-amount">{o.expected_cents ? formatCents(o.expected_cents) : "Por confirmar"}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* En celular: lista por día */}
        <ul className="list cal-agenda">
          {inMonth.length === 0 && <li className="muted">Sin pagos este mes.</li>}
          {[...new Set(inMonth.map((o) => o.due_date))].map((day) => (
            <li key={day}>
              <strong>
                {Number(day.slice(8))} de {MONTHS[m - 1]}
                {day === now ? " · Hoy" : ""}
              </strong>
              {(byDay.get(day) ?? []).map((o) => {
                const s = statusLabel(o, now);
                return (
                  <Link key={o.id} href={`/pagos/${o.id}`} className="row" style={{ fontWeight: 400, color: "inherit", marginTop: 6 }}>
                    <span>
                      {o.concept} <span className={`badge ${s.tone}`}>{s.text}</span>
                    </span>
                    <span className="num">{o.expected_cents ? formatCents(o.expected_cents) : "Por confirmar"}</span>
                  </Link>
                );
              })}
            </li>
          ))}
        </ul>
      </section>

      <p className="muted">
        Leyenda: <span className="badge">Pendiente</span> <span className="badge warn">Hoy</span>{" "}
        <span className="badge critical">Vencido</span> <span className="badge ok">Pagado</span> · Los cancelados aparecen tachados.
      </p>
    </main>
  );
}

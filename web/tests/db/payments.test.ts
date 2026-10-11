import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb, pesos, type Db } from "./helpers";

let db: Db;
let ed: string, viewer: string;
let banco: string, tarjeta: string;
let cat: Record<string, string>;

const balance = async (id: string) =>
  Number((await db.as<{ b: string }>(ed, "select account_balance($1, '2030-01-01') as b", [id]))[0].b);

const rule = async (fields: Record<string, unknown>) => {
  const base = { concept: "Regla", category_id: cat["Servicios"], start_date: "2026-01-01", generate_from: "2026-01-01" };
  const row = { ...base, ...fields };
  const keys = Object.keys(row);
  const [{ id }] = await db.as<{ id: string }>(
    ed,
    `insert into recurrence_rules (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(row),
  );
  return id;
};

const datesOf = async (ruleId: string) =>
  (
    await db.sql<{ d: string }>(
      "select to_char(due_date, 'YYYY-MM-DD') d from payment_occurrences where rule_id = $1 order by due_date",
      [ruleId],
    )
  ).map((r) => r.d);

const oneOff = async (fields: Record<string, unknown> = {}) => {
  const row = { concept: "Doctor", due_date: "2026-03-10", category_id: cat["Salud"], expected_cents: pesos(800), ...fields };
  const keys = Object.keys(row);
  const [{ id }] = await db.as<{ id: string }>(
    ed,
    `insert into payment_occurrences (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(row),
  );
  return id;
};

beforeAll(async () => {
  db = await freshDb();
  ed = await db.createUser("editora@ejemplo.test", { role: "editor", active: true });
  viewer = await db.createUser("consulta@ejemplo.test", { role: "viewer", active: true });
  cat = Object.fromEntries((await db.sql<{ id: string; name: string }>("select id, name from categories")).map((r) => [r.name, r.id]));
  [{ id: banco }] = await db.as<{ id: string }>(ed, "insert into accounts (name, type, start_date, opening_balance_cents, available_for_payments) values ('Cuenta A', 'bank', '2026-01-01', $1, true) returning id", [pesos(10_000)]);
  [{ id: tarjeta }] = await db.as<{ id: string }>(ed, "insert into accounts (name, type, start_date, opening_balance_cents) values ('Tarjeta X', 'credit', '2026-01-01', 0) returning id");
});

afterAll(() => db.close());

describe("recurrencias (criterio 6)", () => {
  it("enfermeros sábado y domingo: dos pagos por fin de semana, sin duplicar al reprocesar", async () => {
    const r = await rule({ concept: "Enfermero", category_id: cat["Enfermería"], frequency: "weekly", weekdays: [6, 0], start_date: "2026-03-01", generate_from: "2026-03-01", end_date: "2026-03-15" });
    await db.as(ed, "select generate_occurrences('2026-03-31')");
    await db.as(ed, "select generate_occurrences('2026-03-31')");
    expect(await datesOf(r)).toEqual(["2026-03-01", "2026-03-07", "2026-03-08", "2026-03-14", "2026-03-15"]);
  });

  it("día 31 mensual usa el último día del mes", async () => {
    const r = await rule({ frequency: "monthly", day_of_month: 31, end_date: "2026-04-30" });
    await db.as(ed, "select generate_occurrences('2026-04-30')");
    expect(await datesOf(r)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("29 de febrero anual usa el 28 en años no bisiestos", async () => {
    const r = await rule({ concept: "Predial", category_id: cat["Predial"], frequency: "yearly", day_of_month: 29, month_of_year: 2, start_date: "2027-01-01", generate_from: "2027-01-01", end_date: "2028-12-31" });
    await db.as(ed, "select generate_occurrences('2028-12-31')");
    expect(await datesOf(r)).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("cada N días", async () => {
    const r = await rule({ frequency: "every_n_days", interval_days: 10, start_date: "2026-05-01", generate_from: "2026-05-01", end_date: "2026-05-31" });
    await db.as(ed, "select generate_occurrences('2026-05-31')");
    expect(await datesOf(r)).toEqual(["2026-05-01", "2026-05-11", "2026-05-21", "2026-05-31"]);
  });

  it("un pendiente sin importe queda por confirmar (null), no como cero (criterio 5)", async () => {
    const r = await rule({ concept: "Luz", frequency: "monthly", day_of_month: 5, end_date: "2026-01-31" });
    await db.as(ed, "select generate_occurrences('2026-01-31')");
    const [o] = await db.sql<{ expected_cents: string | null }>("select expected_cents from payment_occurrences where rule_id = $1", [r]);
    expect(o.expected_cents).toBeNull();
  });
});

describe("registrar pago (criterio 7)", () => {
  it("crea un solo movimiento y marca pagado; el segundo intento falla", async () => {
    const o = await oneOff();
    const before = await balance(banco);
    await db.as(ed, "select register_payment($1, $2, $3, '2026-03-10')", [o, banco, pesos(850)]);
    await expect(db.as(ed, "select register_payment($1, $2, $3, '2026-03-10')", [o, banco, pesos(850)])).rejects.toThrow(/ya está registrado/);
    expect(await balance(banco)).toBe(before - pesos(850));
    const [row] = await db.sql<{ status: string; expected_cents: string }>("select status, expected_cents from payment_occurrences where id = $1", [o]);
    expect(row.status).toBe("paid");
    expect(Number(row.expected_cents)).toBe(pesos(800));
    const [{ n }] = await db.sql<{ n: string }>("select count(*) n from transactions t join payment_occurrences p on p.transaction_id = t.id where p.id = $1", [o]);
    expect(Number(n)).toBe(1);
  });

  it("peticiones simultáneas no duplican el movimiento", async () => {
    const o = await oneOff({ concept: "Concurrente" });
    const db2 = db; // misma base, dos conexiones
    const { Client } = await import("pg");
    const [{ url }] = await db2.sql<{ url: string }>("select current_database() as url");
    const mk = async () => {
      const c = new Client({ connectionString: `${process.env.TEST_PG_URL ?? "postgres://localhost:5432/postgres"}`.replace(/\/[^/]*$/, `/${url}`) });
      await c.connect();
      return c;
    };
    const [a, b] = await Promise.all([mk(), mk()]);
    const run = async (c: InstanceType<typeof Client>) => {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ed })]);
      try {
        await c.query("select register_payment($1, $2, 100, '2026-03-11')", [o, banco]);
        await c.query("commit");
        return "ok";
      } catch {
        await c.query("rollback");
        return "error";
      }
    };
    const results = await Promise.all([run(a), run(b)]);
    await Promise.all([a.end(), b.end()]);
    expect(results.sort()).toEqual(["error", "ok"]);
    const [{ n }] = await db.sql<{ n: string }>("select count(*) n from transactions where concept = 'Concurrente'");
    expect(Number(n)).toBe(1);
  });

  it("vincular un gasto existente no cambia saldos otra vez", async () => {
    const o = await oneOff({ concept: "Farmacia" });
    const [{ id: tx }] = await db.as<{ id: string }>(ed, "insert into transactions (kind, account_id, amount_cents, effective_date, category_id, concept) values ('expense', $1, 5000, '2026-03-12', $2, 'Farmacia') returning id", [banco, cat["Salud"]]);
    const before = await balance(banco);
    await db.as(ed, "select link_payment($1, $2)", [o, tx]);
    expect(await balance(banco)).toBe(before);
    const o2 = await oneOff({ concept: "Otro" });
    await expect(db.as(ed, "select link_payment($1, $2)", [o2, tx])).rejects.toThrow(/otro pago/);
  });

  it("pago de tarjeta es traspaso, sin nuevo gasto", async () => {
    await db.as(ed, "insert into transactions (kind, account_id, amount_cents, effective_date, category_id, concept) values ('expense', $1, $2, '2026-03-01', $3, 'Doctor')", [tarjeta, pesos(1_000), cat["Salud"]]);
    const o = await oneOff({ concept: "Pago tarjeta", kind: "card_payment", card_account_id: tarjeta, category_id: null, expected_cents: pesos(1_000) });
    const [{ expense_cents: before }] = await db.as<{ expense_cents: string }>(ed, "select * from month_summary('2026-03-15')");
    await db.as(ed, "select register_payment($1, $2, $3, '2026-03-20')", [o, banco, pesos(1_000)]);
    expect(await balance(tarjeta)).toBe(0);
    const [{ expense_cents: after }] = await db.as<{ expense_cents: string }>(ed, "select * from month_summary('2026-03-15')");
    expect(after).toBe(before);
  });
});

describe("anular, cancelar y cambiar la serie (criterios 8 y 19)", () => {
  it("anular el movimiento pagador restaura el pendiente y revierte saldos", async () => {
    const o = await oneOff({ concept: "Para anular" });
    const before = await balance(banco);
    const [{ register_payment: tx }] = await db.as<{ register_payment: string }>(ed, "select register_payment($1, $2, 700, '2026-03-13')", [o, banco]);
    await db.as(ed, "update transactions set status = 'voided', void_reason = 'Error' where id = $1", [tx]);
    const [row] = await db.sql<{ status: string; transaction_id: string | null }>("select status, transaction_id from payment_occurrences where id = $1", [o]);
    expect(row).toEqual({ status: "pending", transaction_id: null });
    expect(await balance(banco)).toBe(before);
  });

  it("un pagado no se cancela directamente", async () => {
    const o = await oneOff({ concept: "Pagado" });
    await db.as(ed, "select register_payment($1, $2, 100, '2026-03-14')", [o, banco]);
    await expect(db.as(ed, "update payment_occurrences set status = 'cancelled' where id = $1", [o])).rejects.toThrow(/no se cancela/);
    const deleted = await db.as(ed, "delete from payment_occurrences where id = $1 returning id", [o]);
    expect(deleted).toHaveLength(0);
  });

  it("cambiar o pausar la serie conserva pagados y vencidos; solo reemplaza pendientes futuros", async () => {
    const today = (await db.sql<{ d: string }>("select to_char(family_today(), 'YYYY-MM-DD') d"))[0].d;
    const r = await rule({ concept: "Agua", frequency: "every_n_days", interval_days: 7, start_date: "2026-01-01", generate_from: "2026-01-01" });
    await db.as(ed, "select generate_occurrences()");
    const [{ id: first }] = await db.sql<{ id: string }>("select id from payment_occurrences where rule_id = $1 order by due_date limit 1", [r]);
    await db.as(ed, "select register_payment($1, $2, 300, '2026-01-01')", [first, banco]);
    const pastPending = Number((await db.sql<{ n: string }>("select count(*) n from payment_occurrences where rule_id = $1 and status = 'pending' and due_date < $2", [r, today]))[0].n);
    const future = await db.as<{ n: number }>(ed, "select rule_future_pending($1) n", [r]);
    expect(future[0].n).toBeGreaterThan(0);

    await db.as(ed, "update recurrence_rules set expected_cents = 999 where id = $1", [r]);
    await db.as(ed, "select apply_rule_change($1)", [r]);
    const after = await db.sql<{ status: string; due_date: string; expected_cents: string | null }>(
      "select status, to_char(due_date, 'YYYY-MM-DD') due_date, expected_cents from payment_occurrences where rule_id = $1",
      [r],
    );
    expect(after.filter((o) => o.status === "paid")).toHaveLength(1);
    expect(after.filter((o) => o.status === "pending" && o.due_date < today)).toHaveLength(pastPending);
    expect(after.filter((o) => o.due_date >= today).every((o) => Number(o.expected_cents) === 999)).toBe(true);

    await db.as(ed, "update recurrence_rules set active = false where id = $1", [r]);
    await db.as(ed, "select apply_rule_change($1)", [r]);
    const paused = await db.sql<{ n: string }>("select count(*) n from payment_occurrences where rule_id = $1 and due_date >= $2", [r, today]);
    expect(Number(paused[0].n)).toBe(0);
    expect(Number((await db.sql<{ n: string }>("select count(*) n from payment_occurrences where rule_id = $1 and status = 'paid'", [r]))[0].n)).toBe(1);
  });

  it("consulta ve los pagos pero no los registra", async () => {
    const o = await oneOff({ concept: "Solo lectura" });
    expect((await db.as(viewer, "select id from payment_occurrences where id = $1", [o])).length).toBe(1);
    await expect(db.as(viewer, "select register_payment($1, $2, 100, '2026-03-15')", [o, banco])).rejects.toThrow(/permiso/);
  });
});

describe("documentos (criterio 9 y 10)", () => {
  it("subir un documento no cambia saldos; consulta no puede subir", async () => {
    const before = await balance(banco);
    await db.as(ed, "insert into storage.objects (bucket_id, name) values ('documents', 'x/estado.pdf')");
    await db.as(ed, "insert into documents (kind, storage_path, file_name, mime_type, size_bytes, account_id) values ('statement', 'x/estado.pdf', 'estado.pdf', 'application/pdf', 1000, $1)", [banco]);
    expect(await balance(banco)).toBe(before);
    await expect(db.as(viewer, "insert into storage.objects (bucket_id, name) values ('documents', 'y.pdf')")).rejects.toThrow();
    expect((await db.as(viewer, "select * from storage.objects where bucket_id = 'documents'")).length).toBe(1);
  });

  it("revisión de saldo: calcula lo registrado a la fecha y la diferencia, sin corregir", async () => {
    const [{ id: cuenta }] = await db.as<{ id: string }>(ed, "insert into accounts (name, type, start_date, opening_balance_cents) values ('Revisión', 'bank', '2026-01-01', $1) returning id", [pesos(14_000)]);
    const [rev] = await db.as<{ id: string; recorded_cents: string; declared_cents: string }>(
      ed,
      "insert into balance_reviews (account_id, cutoff_date, declared_cents, recorded_cents) values ($1, '2026-02-28', $2, 0) returning *",
      [cuenta, pesos(14_200)],
    );
    expect(Number(rev.recorded_cents)).toBe(pesos(14_000));
    expect(Number(rev.declared_cents) - Number(rev.recorded_cents)).toBe(pesos(200));
    expect(await balance(cuenta)).toBe(pesos(14_000));
  });
});

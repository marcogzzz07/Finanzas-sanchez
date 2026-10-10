import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb, pesos, type Db } from "./helpers";

let db: Db;
let ed: string;
let banco: string, efectivo: string, tarjeta: string, inversion: string;
let cat: Record<string, string>;

const balance = async (id: string, asOf?: string) =>
  Number((await db.as<{ b: string }>(ed, "select account_balance($1, $2) as b", [id, asOf ?? null]))[0].b);

const tx = async (fields: Record<string, unknown>) => {
  const keys = Object.keys(fields);
  const [{ id }] = await db.as<{ id: string }>(
    ed,
    `insert into transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(fields),
  );
  return id;
};

const account = async (name: string, type: string, opening: number | null, available = false) => {
  const [{ id }] = await db.as<{ id: string }>(
    ed,
    `insert into accounts (name, type, start_date, opening_balance_cents, available_for_payments)
     values ($1, $2, $3, $4, $5) returning id`,
    [name, type, opening === null ? null : "2026-01-01", opening === null ? null : pesos(opening), available],
  );
  return id;
};

beforeAll(async () => {
  db = await freshDb();
  ed = await db.createUser("editora@ejemplo.test", { role: "editor", active: true });
  const rows = await db.sql<{ id: string; name: string }>("select id, name from categories");
  cat = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  banco = await account("Cuenta A", "bank", 10_000, true);
  efectivo = await account("Caja", "cash", 2_000, true);
  tarjeta = await account("Tarjeta X", "credit", 0);
  inversion = await account("Inversión Y", "investment", 50_000);
});

afterAll(() => db.close());

describe("reglas de dinero (criterios 2, 3, 4, 11)", () => {
  it("renta y gasto en efectivo", async () => {
    await tx({ kind: "income", account_id: banco, amount_cents: pesos(5_000), effective_date: "2026-02-01", category_id: cat["Rentas"], concept: "Renta depto" });
    await tx({ kind: "expense", account_id: efectivo, amount_cents: pesos(500), effective_date: "2026-02-02", category_id: cat["Enfermería"], concept: "Enfermero sábado" });
    expect(await balance(banco)).toBe(pesos(15_000));
    expect(await balance(efectivo)).toBe(pesos(1_500));
  });

  it("gasto con tarjeta y pago de tarjeta no duplica el gasto", async () => {
    await tx({ kind: "expense", account_id: tarjeta, amount_cents: pesos(1_000), effective_date: "2026-02-03", category_id: cat["Salud"], concept: "Doctor" });
    expect(await balance(tarjeta)).toBe(pesos(1_000));
    await tx({ kind: "transfer", account_id: banco, to_account_id: tarjeta, amount_cents: pesos(1_000), effective_date: "2026-02-04", concept: "Pago de tarjeta" });
    expect(await balance(banco)).toBe(pesos(14_000));
    expect(await balance(tarjeta)).toBe(0);
    const [m] = await db.as<{ income_cents: string; expense_cents: string }>(ed, "select * from month_summary('2026-02-15')");
    expect(Number(m.expense_cents)).toBe(pesos(1_500));
    expect(Number(m.income_cents)).toBe(pesos(5_000));
  });

  it("retiro a efectivo conserva la liquidez y no es ingreso ni gasto", async () => {
    const before = (await balance(banco)) + (await balance(efectivo));
    await tx({ kind: "transfer", account_id: banco, to_account_id: efectivo, amount_cents: pesos(1_000), effective_date: "2026-02-05", concept: "Retiro" });
    expect((await balance(banco)) + (await balance(efectivo))).toBe(before);
    const [m] = await db.as<{ income_cents: string; expense_cents: string }>(ed, "select * from month_summary('2026-02-15')");
    expect(Number(m.expense_cents)).toBe(pesos(1_500));
  });

  it("devolución en tarjeta reduce gasto y deuda; sin deuda queda saldo a favor", async () => {
    await tx({ kind: "refund", account_id: tarjeta, amount_cents: pesos(200), effective_date: "2026-02-06", category_id: cat["Salud"], concept: "Devolución doctor" });
    expect(await balance(tarjeta)).toBe(-pesos(200));
    const [m] = await db.as<{ expense_cents: string }>(ed, "select * from month_summary('2026-02-15')");
    expect(Number(m.expense_cents)).toBe(pesos(1_300));
  });

  it("inversión: retiro de capital es traspaso; interés es ingreso", async () => {
    await tx({ kind: "transfer", account_id: inversion, to_account_id: banco, amount_cents: pesos(5_000), effective_date: "2026-02-07", concept: "Retiro de capital" });
    await tx({ kind: "income", account_id: inversion, amount_cents: pesos(300), effective_date: "2026-02-28", category_id: cat["Ingresos bancarios"], concept: "Interés" });
    expect(await balance(inversion)).toBe(pesos(45_300));
  });

  it("la tarjeta no acepta ingresos ni traspasos de salida", async () => {
    await expect(tx({ kind: "income", account_id: tarjeta, amount_cents: 100, effective_date: "2026-02-08", category_id: cat["Rentas"], concept: "X" })).rejects.toThrow(/no se admite/);
    await expect(tx({ kind: "transfer", account_id: tarjeta, to_account_id: banco, amount_cents: 100, effective_date: "2026-02-08", concept: "X" })).rejects.toThrow(/no se admite/);
  });

  it("importes en centavos positivos, categoría acorde y fechas dentro del registro", async () => {
    await expect(tx({ kind: "expense", account_id: banco, amount_cents: 0, effective_date: "2026-02-08", category_id: cat["Salud"], concept: "X" })).rejects.toThrow();
    await expect(tx({ kind: "expense", account_id: banco, amount_cents: 100, effective_date: "2026-02-08", category_id: cat["Rentas"], concept: "X" })).rejects.toThrow(/no corresponde/);
    await expect(tx({ kind: "expense", account_id: banco, amount_cents: 100, effective_date: "2025-12-31", category_id: cat["Salud"], concept: "X" })).rejects.toThrow(/anterior al inicio/);
  });

  it("la liquidez usa la marca de disponible, no el nombre ni el límite de crédito (criterio 11 y 18)", async () => {
    const rows = await db.as<{ account_id: string; available_for_payments: boolean; has_opening: boolean; type: string }>(ed, "select * from account_balances()");
    const available = rows.filter((r) => r.available_for_payments && r.has_opening).map((r) => r.account_id).sort();
    expect(available).toEqual([banco, efectivo].sort());
    await db.as(ed, "update accounts set available_for_payments = true where id = $1", [tarjeta]);
    const [t] = await db.as<{ available_for_payments: boolean }>(ed, "select available_for_payments from accounts where id = $1", [tarjeta]);
    expect(t.available_for_payments).toBe(false);
  });
});

describe("edición y anulación (criterio 24 parcial)", () => {
  it("editar concepto e importe recalcula y deja rastro; anular revierte", async () => {
    const id = await tx({ kind: "expense", account_id: efectivo, amount_cents: pesos(100), effective_date: "2026-03-01", category_id: cat["Otros gastos"], concept: "Farmacia" });
    const before = await balance(efectivo);
    await db.as(ed, "update transactions set concept = 'Farmacia del Ahorro', detail = 'Medicinas', amount_cents = $2 where id = $1", [id, pesos(150)]);
    expect(await balance(efectivo)).toBe(before - pesos(50));
    const [row] = await db.sql<{ updated_by: string; created_by: string }>("select updated_by, created_by from transactions where id = $1", [id]);
    expect(row.updated_by).toBe(ed);
    expect(row.created_by).toBe(ed);

    await expect(db.as(ed, "update transactions set status = 'voided' where id = $1", [id])).rejects.toThrow();
    await db.as(ed, "update transactions set status = 'voided', void_reason = 'Duplicado' where id = $1", [id]);
    expect(await balance(efectivo)).toBe(before + pesos(100));
    await expect(db.as(ed, "update transactions set amount_cents = 1 where id = $1", [id])).rejects.toThrow(/anulado/);
    await expect(db.as(ed, "delete from transactions where id = $1", [id])).rejects.toThrow();
  });

  it("cambiar un movimiento anterior a un corte desactualiza la revisión (criterio 10)", async () => {
    const [{ id: rev }] = await db.as<{ id: string }>(
      ed,
      "insert into balance_reviews (account_id, cutoff_date, declared_cents, recorded_cents) values ($1, '2026-03-31', $2, $3) returning id",
      [efectivo, pesos(1), pesos(1)],
    );
    await tx({ kind: "expense", account_id: efectivo, amount_cents: pesos(10), effective_date: "2026-04-15", category_id: cat["Otros gastos"], concept: "Posterior" });
    expect((await db.sql<{ stale: boolean }>("select stale from balance_reviews where id = $1", [rev]))[0].stale).toBe(false);
    await tx({ kind: "expense", account_id: efectivo, amount_cents: pesos(10), effective_date: "2026-03-15", category_id: cat["Otros gastos"], concept: "Anterior" });
    expect((await db.sql<{ stale: boolean }>("select stale from balance_reviews where id = $1", [rev]))[0].stale).toBe(true);
  });
});

describe("flexibilidad (criterios 15, 16, 17, 18)", () => {
  it("un banco y una quinta cuenta nuevos funcionan sin cambios de código", async () => {
    const [{ id: inst }] = await db.as<{ id: string }>(ed, "insert into institutions (name) values ('Banco Z') returning id");
    const [{ id: resp }] = await db.as<{ id: string }>(ed, "insert into responsible_people (name) values ('Persona Q') returning id");
    const quinta = await account("Quinta cuenta", "bank", 1_000, true);
    await db.as(ed, "update accounts set institution_id = $2, responsible_id = $3 where id = $1", [quinta, inst, resp]);
    const rows = await db.as<{ account_id: string; institution_name: string; responsible_name: string }>(ed, "select * from account_balances()");
    const q = rows.find((r) => r.account_id === quinta)!;
    expect(q.institution_name).toBe("Banco Z");
    expect(q.responsible_name).toBe("Persona Q");
  });

  it("crédito sin historial pasa a débito y la deuda se vuelve fondos", async () => {
    const c = await account("Tarjeta nueva", "credit", 300);
    await db.as(ed, "select change_account_type($1, 'debit', $2)", [c, pesos(800)]);
    const [a] = await db.as<{ type: string }>(ed, "select type from accounts where id = $1", [c]);
    expect(a.type).toBe("debit");
    expect(await balance(c)).toBe(pesos(800));
  });

  it("con historial: vista previa, incompatibles se resuelven y todo es atómico", async () => {
    const d = await account("Débito con historia", "debit", 1_000);
    const ingreso = await tx({ kind: "income", account_id: d, amount_cents: pesos(200), effective_date: "2026-05-01", category_id: cat["Otros ingresos"], concept: "Depósito" });
    await tx({ kind: "expense", account_id: d, amount_cents: pesos(100), effective_date: "2026-05-02", category_id: cat["Salud"], concept: "Consulta" });

    const preview = await db.as<{ incompatible_tx_id: string; new_balance_cents: string }>(ed, "select * from preview_account_type_change($1, 'credit')", [d]);
    expect(preview.map((p) => p.incompatible_tx_id)).toEqual([ingreso]);
    expect(Number(preview[0].new_balance_cents)).toBe(pesos(1_100));

    await db.sql("insert into balance_reviews (account_id, cutoff_date, declared_cents, recorded_cents) values ($1, '2026-05-31', 0, 0)", [d]);
    await expect(db.as(ed, "select change_account_type($1, 'credit', 0)", [d])).rejects.toThrow(/no son compatibles/);
    const [still] = await db.as<{ type: string }>(ed, "select type from accounts where id = $1", [d]);
    expect(still.type).toBe("debit");

    await db.as(ed, "select change_account_type($1, 'credit', 0, $2, 'No era ingreso')", [d, [ingreso]]);
    expect(await balance(d)).toBe(pesos(100));
    const [r] = await db.sql<{ stale: boolean }>("select stale from balance_reviews where account_id = $1", [d]);
    expect(r.stale).toBe(true);
  });

  it("renombrar conserva vínculos; retirar con vínculos exige reasignar o archivar", async () => {
    await db.as(ed, "update categories set name = 'Salud y médicos' where id = $1", [cat["Salud"]]);
    const [{ n }] = await db.as<{ n: string }>(ed, "select count(*) n from transactions where category_id = $1", [cat["Salud"]]);
    expect(Number(n)).toBeGreaterThan(0);
    await expect(db.as(ed, "delete from categories where id = $1", [cat["Salud"]])).rejects.toThrow();
    const [{ id: nueva }] = await db.as<{ id: string }>(ed, "insert into categories (name, use) values ('Médicos', 'expense') returning id");
    await db.as(ed, "select reassign_catalog('categories', $1, $2)", [cat["Salud"], nueva]);
    await db.as(ed, "delete from categories where id = $1", [cat["Salud"]]);
    const [{ c }] = await db.as<{ c: number }>(ed, "select reference_count('categories', $1) c", [nueva]);
    expect(c).toBeGreaterThan(0);
  });

  it("archivar quita de nuevas capturas y se puede reactivar; sin vínculos se elimina", async () => {
    await db.as(ed, "update accounts set archived = true where id = $1", [inversion]);
    await expect(tx({ kind: "income", account_id: inversion, amount_cents: 100, effective_date: "2026-06-01", category_id: cat["Otros ingresos"], concept: "X" })).rejects.toThrow(/archivada/);
    await db.as(ed, "update accounts set archived = false where id = $1", [inversion]);
    await expect(db.as(ed, "delete from accounts where id = $1", [inversion])).rejects.toThrow();
    const vacia = await account("Vacía", "cash", null);
    await db.as(ed, "delete from accounts where id = $1", [vacia]);
  });

  it("la fecha de inicio no puede dejar movimientos fuera", async () => {
    await expect(db.as(ed, "update accounts set start_date = '2026-03-01' where id = $1", [banco])).rejects.toThrow(/quedarían antes/);
  });

  it("cuenta sin saldo de arranque acepta movimientos y queda marcada", async () => {
    const sin = await account("Sin arranque", "bank", null, true);
    await tx({ kind: "income", account_id: sin, amount_cents: pesos(10), effective_date: "2026-06-01", category_id: cat["Otros ingresos"], concept: "Depósito" });
    const rows = await db.as<{ account_id: string; has_opening: boolean }>(ed, "select * from account_balances()");
    expect(rows.find((r) => r.account_id === sin)!.has_opening).toBe(false);
  });
});

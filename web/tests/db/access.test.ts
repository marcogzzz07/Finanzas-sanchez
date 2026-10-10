import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb, type Db } from "./helpers";

let db: Db;
let admin: string, editor: string, viewer: string, outsider: string, inactive: string;

beforeAll(async () => {
  db = await freshDb();
  await db.sql("insert into private.bootstrap_admin (email) values ('marco@ejemplo.test')");
  admin = await db.createUser("marco@ejemplo.test");
  editor = await db.createUser("editora@ejemplo.test", { role: "editor", active: true });
  viewer = await db.createUser("consulta@ejemplo.test", { role: "viewer", active: true });
  outsider = await db.createUser("desconocido@ejemplo.test");
  inactive = await db.createUser("inactiva@ejemplo.test", { role: "editor", active: false });
});

afterAll(() => db.close());

describe("accesos (criterio 1 y 20)", () => {
  it("solo el correo autorizado se vuelve el primer administrador", async () => {
    const [p] = await db.sql<{ role: string; active: boolean }>("select role, active from profiles where id = $1", [admin]);
    expect(p).toEqual({ role: "admin", active: true });
    const [o] = await db.sql<{ role: string; active: boolean }>("select role, active from profiles where id = $1", [outsider]);
    expect(o).toEqual({ role: "viewer", active: false });
  });

  it("una persona sin acceso activo no ve datos", async () => {
    expect(await db.as(outsider, "select * from accounts")).toHaveLength(0);
    expect(await db.as(outsider, "select * from profiles")).toHaveLength(0);
    expect(await db.as(inactive, "select * from categories")).toHaveLength(0);
    await expect(db.as(inactive, "insert into institutions (name) values ('X')")).rejects.toThrow();
  });

  it("consulta lee pero no escribe, aunque llame directo a la API", async () => {
    expect((await db.as(viewer, "select * from accounts")).length).toBeGreaterThan(0);
    await expect(db.as(viewer, "insert into institutions (name) values ('Otro banco')")).rejects.toThrow();
    const updated = await db.as(viewer, "update categories set name = 'X' returning id");
    expect(updated).toHaveLength(0);
  });

  it("editor administra catálogos y cuentas, pero no roles ni configuración global", async () => {
    await db.as(editor, "insert into institutions (name) values ('Banco Nuevo')");
    await expect(db.as(editor, "update profiles set role = 'admin' where id = $1", [editor])).rejects.toThrow();
    await expect(db.as(editor, "select admin_set_access($1, 'admin', true)", [editor])).rejects.toThrow(/administrador/);
    const s = await db.as(editor, "update family_settings set digest_hour = 9 returning id");
    expect(s).toHaveLength(0);
  });

  it("cada quien edita su nombre, no su rol", async () => {
    await db.as(viewer, "update profiles set full_name = 'Nombre nuevo' where id = $1", [viewer]);
    const [p] = await db.sql<{ full_name: string }>("select full_name from profiles where id = $1", [viewer]);
    expect(p.full_name).toBe("Nombre nuevo");
    const other = await db.as(viewer, "update profiles set full_name = 'X' where id = $1 returning id", [editor]);
    expect(other).toHaveLength(0);
  });

  it("administrador invita, cambia rol, desactiva y edita avisos", async () => {
    await db.as(admin, "select admin_set_access($1, 'editor', true)", [outsider]);
    expect((await db.as(outsider, "select * from accounts")).length).toBeGreaterThan(0);
    await db.as(admin, "select admin_set_access($1, 'viewer', false)", [outsider]);
    expect(await db.as(outsider, "select * from accounts")).toHaveLength(0);
    await db.as(admin, "update family_settings set digest_hour = 9, lead_days = 2");
    const users = await db.as<{ email: string }>(admin, "select * from admin_list_users()");
    expect(users.map((u) => u.email)).toContain("editora@ejemplo.test");
    await expect(db.as(editor, "select * from admin_list_users()")).rejects.toThrow();
  });

  it("no se puede quitar el último administrador activo", async () => {
    await expect(db.as(admin, "select admin_set_access($1, 'editor', true)", [admin])).rejects.toThrow(/último administrador/);
    await expect(db.as(admin, "select admin_set_access($1, 'admin', false)", [admin])).rejects.toThrow(/último administrador/);
    await db.as(admin, "select admin_set_access($1, 'admin', true)", [editor]);
    await db.as(admin, "select admin_set_access($1, 'editor', true)", [admin]);
    const [p] = await db.sql<{ role: string }>("select role from profiles where id = $1", [admin]);
    expect(p.role).toBe("editor");
  });

  it("anon no lee nada", async () => {
    await db.sql("begin");
    await db.sql("set local role anon");
    await expect(db.sql("select * from accounts")).rejects.toThrow();
    await db.sql("rollback");
  });
});

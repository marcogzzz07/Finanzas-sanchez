import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const ADMIN_URL = process.env.TEST_PG_URL ?? "postgres://localhost:5432/postgres";
const ROOT = join(__dirname, "..", "..");

export type Db = {
  /** Superusuario: prepara datos sin RLS. */
  sql: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  /** Ejecuta como usuario autenticado de Supabase, con RLS. */
  as: <T = Record<string, unknown>>(userId: string, text: string, params?: unknown[]) => Promise<T[]>;
  createUser: (email: string, opts?: { role?: "admin" | "editor" | "viewer"; active?: boolean; name?: string }) => Promise<string>;
  close: () => Promise<void>;
};

export async function freshDb(): Promise<Db> {
  const name = `finanzas_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  await client.query(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migración ${file}: ${(e as Error).message}`);
    }
  }

  const sql = async <T,>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as T[];

  const as = async <T,>(userId: string, text: string, params?: unknown[]) => {
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      const rows = (await client.query(text, params)).rows as T[];
      await client.query("commit");
      return rows;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  };

  const createUser: Db["createUser"] = async (email, opts = {}) => {
    const [{ id }] = await sql<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, { full_name: opts.name ?? email.split("@")[0] }],
    );
    if (opts.role || opts.active !== undefined) {
      await sql("update public.profiles set role = coalesce($2, role), active = coalesce($3, active) where id = $1", [
        id,
        opts.role ?? null,
        opts.active ?? null,
      ]);
    }
    return id;
  };

  const close = async () => {
    await client.end();
    const a = new Client({ connectionString: ADMIN_URL });
    await a.connect();
    await a.query(`drop database if exists ${name} with (force)`);
    await a.end();
  };

  return { sql, as, createUser, close };
}

export const pesos = (n: number) => Math.round(n * 100);

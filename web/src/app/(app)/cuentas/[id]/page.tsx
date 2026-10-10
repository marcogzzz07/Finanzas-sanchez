import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getBalances, getCatalogs } from "@/lib/data";
import { ACCOUNT_TYPES, balanceLabel, type AccountType } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { requireMember } from "@/lib/session";
import { AccountForm, ArchiveForm, DeleteForm, TypeChangeForm, type AccountInitial, type Incompatible } from "../AccountForms";

type Preview = {
  incompatible_tx_id: string | null;
  kind: string;
  effective_date: string;
  concept: string;
  amount_cents: number;
  current_balance_cents: number;
  new_balance_cents: number;
};

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string; nuevoTipo?: string }>;
}) {
  const { supabase, canWrite } = await requireMember();
  const { id } = await params;
  const { guardado, nuevoTipo } = await searchParams;

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle<AccountInitial & { id: string; type: AccountType; archived: boolean }>();
  if (!account) notFound();

  const [balances, catalogs, refs, pendingTx] = await Promise.all([
    getBalances(supabase),
    getCatalogs(supabase),
    supabase.rpc("reference_count", { p_catalog: "accounts", p_id: id }),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "active").or(`account_id.eq.${id},to_account_id.eq.${id}`),
  ]);
  const b = balances.find((x) => x.account_id === id)!;
  const refCount = Number(refs.data ?? 0);

  const targetType = nuevoTipo && nuevoTipo in ACCOUNT_TYPES && nuevoTipo !== account.type ? (nuevoTipo as AccountType) : null;
  let preview: Preview[] = [];
  if (targetType) {
    const { data } = await supabase.rpc("preview_account_type_change", { p_account: id, p_new_type: targetType });
    preview = (data ?? []) as Preview[];
  }
  const incompatible: Incompatible[] = preview
    .filter((p) => p.incompatible_tx_id)
    .map((p) => ({ id: p.incompatible_tx_id!, kind: p.kind, effective_date: p.effective_date, concept: p.concept, amount_cents: p.amount_cents }));

  return (
    <main>
      <p>
        <Link href="/cuentas">← Cuentas</Link>
      </p>
      {guardado && <p className="notice">Guardado.</p>}

      <section className="card soft">
        <div className="muted">
          {ACCOUNT_TYPES[account.type]}
          {b.institution_name ? ` · ${b.institution_name}` : ""}
          {account.archived ? " · Archivada" : ""}
        </div>
        <h1 style={{ margin: "4px 0" }}>{account.name}</h1>
        {b.has_opening ? (
          <>
            <div className="stat">
              {formatCents(account.type === "credit" ? Math.abs(Number(b.balance_cents)) : b.balance_cents)}
            </div>
            <div className="muted">
              {balanceLabel(account.type, Number(b.balance_cents))} según registros, desde el {formatDate(account.start_date!)}.
            </div>
          </>
        ) : (
          <p className="badge warn">
            Saldo por confirmar: falta el saldo de arranque. Se toma del primer estado de cuenta, o captúralo abajo.
          </p>
        )}
        <p>
          <Link href={`/movimientos?cuenta=${id}`}>Ver movimientos de esta cuenta</Link>
        </p>
      </section>

      {canWrite && (
        <>
          <h2>Editar</h2>
          <div className="card">
            <AccountForm
              initial={account}
              institutions={catalogs.institutions.filter((i) => !i.archived || i.id === account.institution_id)}
              people={catalogs.people.filter((p) => !p.archived || p.id === account.responsible_id)}
            />
          </div>

          <h2>Cambiar tipo</h2>
          <div className="card stack">
            <p className="muted">
              Corrige la clasificación de esta cuenta (por ejemplo, de crédito a débito). Los saldos se recalculan con el
              nuevo tipo. Si en realidad es una cuenta distinta, mejor <Link href="/cuentas/nueva">crea la nueva</Link> y
              archiva esta.
            </p>
            <form method="get" className="row">
              <select name="nuevoTipo" defaultValue={targetType ?? ""}>
                <option value="">Elige el tipo nuevo…</option>
                {Object.entries(ACCOUNT_TYPES)
                  .filter(([k]) => k !== account.type)
                  .map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
              </select>
              <button className="secondary" style={{ width: "auto" }}>Ver efecto</button>
            </form>
            {targetType && preview[0] && (
              <TypeChangeForm
                id={id}
                newType={targetType}
                incompatible={incompatible}
                currentBalance={Number(preview[0].current_balance_cents)}
                newBalance={Number(preview[0].new_balance_cents)}
                hasOpening={b.has_opening}
                openingCents={account.opening_balance_cents ?? null}
              />
            )}
          </div>

          <h2>Retirar</h2>
          <div className="card stack">
            <ArchiveForm
              id={id}
              archived={account.archived}
              impact={
                b.has_opening && Number(b.balance_cents) !== 0
                  ? `Tiene ${formatCents(b.balance_cents)} registrados que dejarán de contar en el dinero para pagos.`
                  : (pendingTx.count ?? 0) > 0
                    ? `Tiene ${pendingTx.count} movimiento(s) que se conservan.`
                    : undefined
              }
            />
            {refCount === 0 ? (
              <DeleteForm id={id} />
            ) : (
              <p className="muted">
                No se puede eliminar porque tiene {refCount} registro(s) vinculados. Archívala para conservar su historial.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

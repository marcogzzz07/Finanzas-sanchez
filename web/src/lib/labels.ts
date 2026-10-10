export const ACCOUNT_TYPES = {
  bank: "Cuenta bancaria",
  debit: "Tarjeta de débito / cuenta asociada",
  credit: "Tarjeta de crédito",
  cash: "Efectivo",
  investment: "Inversión",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;

export const TX_KINDS = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Traspaso",
  refund: "Devolución",
} as const;
export type TxKind = keyof typeof TX_KINDS;

export const CATEGORY_USES = { income: "Ingresos", expense: "Gastos", both: "Ambos" } as const;
export const LABEL_KINDS = { property: "Inmueble", beneficiary: "Beneficiario" } as const;
export const ROLES = { admin: "Administrador", editor: "Editor", viewer: "Consulta" } as const;

/** Qué muestra el saldo según el tipo de cuenta. */
export function balanceLabel(type: AccountType, cents: number): string {
  if (type === "credit") return cents < 0 ? "Saldo a favor" : "Deuda de tarjeta";
  if (type === "cash") return "Efectivo registrado";
  if (type === "investment") return "Saldo de inversión registrado";
  return "Dinero en cuenta";
}

/** Operaciones que admite una cuenta según su tipo (espejo de tx_allowed en la base). */
export function kindsForAccount(type: AccountType): TxKind[] {
  return type === "credit" ? ["expense", "refund"] : ["expense", "income", "transfer", "refund"];
}

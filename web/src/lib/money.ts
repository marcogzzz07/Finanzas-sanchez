// Dinero siempre en centavos enteros. Nunca se usa punto flotante para importes.

const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

function toCents(raw: string, allowNegative: boolean): number | null {
  let s = raw.replace(/[\s$,]/g, "");
  let negative = false;
  if (allowNegative && s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const m = AMOUNT.exec(s);
  if (!m) return null;
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -cents : cents);
}

/** Importe de un movimiento: positivo y mayor que cero. "1,234.5" -> 123450. */
export function parseAmount(raw: string): number | null {
  const cents = toCents(raw, false);
  return cents !== null && cents > 0 ? cents : null;
}

/** Saldo: puede ser cero o negativo (por ejemplo, saldo a favor en tarjeta). */
export function parseBalance(raw: string): number | null {
  return toCents(raw, true);
}

/** 123450 -> "$1,234.50"; -500 -> "-$5.00". */
export function formatCents(value: number | string | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const cents = BigInt(value);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${frac}`;
}

/** Valor para un campo de formulario: 123450 -> "1234.50". */
export function centsToInput(value: number | string | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const cents = BigInt(value);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

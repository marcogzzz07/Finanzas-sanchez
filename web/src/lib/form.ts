/** Estado de un formulario con useActionState: error y valores enviados para no perderlos. */
export type FormState = {
  error?: string;
  ok?: string;
  values?: Record<string, string>;
};

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") out[k] = out[k] ? `${out[k]},${v}` : v;
  });
  return out;
}

export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optional(fd: FormData, key: string): string | null {
  return text(fd, key) || null;
}

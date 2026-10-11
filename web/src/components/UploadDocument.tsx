"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDocument } from "@/app/(app)/documentos/actions";
import { createClient } from "@/lib/supabase/browser";

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

type Option = { id: string; name: string };

/**
 * Sube el archivo directo al bucket privado con la sesión de la persona y luego registra sus datos.
 * Con transactionId fijo sirve para comprobantes de un movimiento.
 */
export function UploadDocument({
  accounts,
  maxMb,
  defaultKind = "statement",
  defaultAccountId,
  transactionId,
  replacesId,
  compact = false,
}: {
  accounts: Option[];
  maxMb: number;
  defaultKind?: "statement" | "receipt" | "other";
  defaultAccountId?: string | null;
  transactionId?: string;
  replacesId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kind, setKind] = useState(defaultKind);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Elige un archivo.");
    const ext = EXT[file.type];
    if (!ext) return setError("Solo se aceptan PDF, JPG o PNG.");
    if (file.size > maxMb * 1024 * 1024) return setError(`El archivo pasa del límite de ${maxMb} MB.`);

    setBusy(true);
    const supabase = createClient();
    const path = `${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      return setError(`No se pudo subir: ${up.error.message}`);
    }
    const value = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const result = await createDocument({
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      kind,
      account_id: transactionId ? null : value("account_id"),
      transaction_id: transactionId ?? null,
      period_start: value("period_start"),
      period_end: value("period_end"),
      cutoff_date: value("cutoff_date"),
      notes: value("notes"),
      replaces_id: replacesId ?? null,
    });
    if (result.error) {
      await supabase.storage.from("documents").remove([path]);
      setBusy(false);
      return setError(result.error);
    }
    form.reset();
    setBusy(false);
    setOk("Documento guardado. No cambia saldos ni crea movimientos.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      {error && <p className="error">{error}</p>}
      {ok && <p className="notice">{ok}</p>}
      <label>
        <span>Archivo (PDF, JPG o PNG, hasta {maxMb} MB)</span>
        <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      {!compact && (
        <>
          <label>
            <span>Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="statement">Estado de cuenta</option>
              <option value="receipt">Comprobante</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label>
            <span>Cuenta</span>
            <select name="account_id" defaultValue={defaultAccountId ?? ""}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          {kind === "statement" && (
            <div className="filters">
              <label className="field">
                <span>Periodo desde</span>
                <input type="date" name="period_start" />
              </label>
              <label className="field">
                <span>Periodo hasta</span>
                <input type="date" name="period_end" />
              </label>
              <label className="field">
                <span>Fecha de corte (opcional)</span>
                <input type="date" name="cutoff_date" />
              </label>
            </div>
          )}
          <label>
            <span>Notas (opcional)</span>
            <input name="notes" />
          </label>
        </>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Subiendo…" : replacesId ? "Subir reemplazo" : "Subir documento"}
      </button>
    </form>
  );
}

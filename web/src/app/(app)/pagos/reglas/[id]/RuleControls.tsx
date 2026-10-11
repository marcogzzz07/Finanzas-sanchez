"use client";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteRule, setRuleActive } from "../../actions";

export function RuleControls({ id, active }: { id: string; active: boolean }) {
  return (
    <div className="stack">
      <ActionForm action={setRuleActive}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(!active)} />
        <p className="muted">
          {active
            ? "Pausar quita los pendientes desde hoy. Los pagos hechos y los vencidos se conservan."
            : "Al reactivar, se generan vencimientos desde hoy (no se crean vencidos del tiempo en pausa)."}
        </p>
        <SubmitButton className="secondary">{active ? "Pausar serie" : "Reactivar serie"}</SubmitButton>
      </ActionForm>
      <ActionForm action={deleteRule}>
        <input type="hidden" name="id" value={id} />
        <p className="muted">Eliminar la serie quita sus pendientes futuros. Los pagos hechos, cancelados y vencidos se quedan como pagos sueltos.</p>
        <SubmitButton className="danger" confirm="¿Eliminar esta serie?">Eliminar serie</SubmitButton>
      </ActionForm>
    </div>
  );
}

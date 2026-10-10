"use client";

import { useFormStatus } from "react-dom";

/** Botón que se desactiva mientras se guarda, para impedir envíos dobles. */
export function SubmitButton({
  children,
  className,
  confirm,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

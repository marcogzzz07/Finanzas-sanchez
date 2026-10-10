"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Inicio" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/pagos", label: "Pagos" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/documentos", label: "Documentos" },
  { href: "/bandeja", label: "Bandeja" },
];

export function Tabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Secciones">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

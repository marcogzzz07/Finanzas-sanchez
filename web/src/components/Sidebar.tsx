"use client";

import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  FileText,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/(auth)/actions";

const MAIN = [
  { href: "/", label: "Inicio", icon: LayoutGrid },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/pagos", label: "Pagos", icon: CalendarClock },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/bandeja", label: "Bandeja", icon: Inbox },
];

const OTHERS = [{ href: "/configuracion", label: "Configuración", icon: Settings }];

export function Sidebar({ name, role, initialCollapsed }: { name: string; role: string; initialCollapsed: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // La preferencia vive en una cookie para que el servidor pinte el ancho correcto sin parpadeo.
    document.cookie = `sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector(".shell")?.setAttribute("data-sidebar", next ? "collapsed" : "open");
  }

  const item = ({ href, label, icon: Icon }: (typeof MAIN)[number]) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          title={collapsed ? label : undefined}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden />
          <span className="side-label">{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="mobilebar">
        <button type="button" className="iconbtn" aria-label="Abrir menú" onClick={() => setOpen(true)}>
          <Menu size={22} />
        </button>
        <strong>Finanzas familiares</strong>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Menú principal">
        <div className="brand">
          <span className="brand-mark" aria-hidden>F</span>
          <span className="side-label">Finanzas familiares</span>
          <button type="button" className="iconbtn close" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          className="side-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
          <span className="side-label">Contraer menú</span>
        </button>

        <p className="side-heading">Menú principal</p>
        <ul className="side-nav">{MAIN.map(item)}</ul>

        <p className="side-heading">Otros</p>
        <ul className="side-nav">{OTHERS.map(item)}</ul>

        <div className="side-footer">
          <div className="who" title={collapsed ? `${name} · ${role}` : undefined}>
            <span className="avatar" aria-hidden>{(name || "?").slice(0, 1).toUpperCase()}</span>
            <span className="side-label">
              <strong>{name || "Mi perfil"}</strong>
              <br />
              <small>{role}</small>
            </span>
          </div>
          <form action={signOut}>
            <button type="submit" className="side-signout" title={collapsed ? "Salir" : undefined}>
              <LogOut size={18} strokeWidth={1.75} aria-hidden />
              <span className="side-label">Salir</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

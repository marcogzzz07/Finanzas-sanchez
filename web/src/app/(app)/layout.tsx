import Link from "next/link";
import { Tabs } from "@/components/Tabs";
import { ROLES } from "@/lib/labels";
import { requireMember } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireMember();
  return (
    <>
      <header className="top">
        <div>
          <strong>Finanzas familiares</strong>
          <Link href="/configuracion" className="muted">
            {profile.full_name || "Mi perfil"} · {ROLES[profile.role]}
          </Link>
        </div>
      </header>
      {children}
      <Tabs />
    </>
  );
}

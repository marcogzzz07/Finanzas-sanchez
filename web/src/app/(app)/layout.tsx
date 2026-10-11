import { Sidebar } from "@/components/Sidebar";
import { ROLES } from "@/lib/labels";
import { requireMember } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireMember();
  return (
    <div className="shell">
      <Sidebar name={profile.full_name} role={ROLES[profile.role]} />
      <div className="content">{children}</div>
    </div>
  );
}

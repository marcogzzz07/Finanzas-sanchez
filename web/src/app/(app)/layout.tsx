import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { ROLES } from "@/lib/labels";
import { requireMember } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireMember();
  const collapsed = (await cookies()).get("sidebar")?.value === "collapsed";
  return (
    <div className="shell" data-sidebar={collapsed ? "collapsed" : "open"}>
      <Sidebar name={profile.full_name} role={ROLES[profile.role]} initialCollapsed={collapsed} />
      <div className="content">{children}</div>
    </div>
  );
}

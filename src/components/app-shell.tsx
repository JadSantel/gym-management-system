"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControl } from "./theme-control";
import { AccountControl } from "./account-control";
import { LiveClock } from "./live-clock";
import { WorkspaceIcon } from "./workspace-icon";
import { AppSidebar, type Destination } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";

type ShellActor = { name: string; gym: string; owner: boolean; members: boolean; cash: boolean };
export function AppShell({ actor, children }: { actor: ShellActor | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const members = actor && (actor.owner || actor.members);
  const actions: Destination[] = actor ? [
    ...(members ? [{ href: "/members?add=member", label: "Add Members", icon: "plus" as const }] : []),
    ...(members && (actor.owner || actor.cash) ? [{ href: "/members#search-name", label: "Record Payment", icon: "wallet" as const }] : []),
  ] : [];
  const overview: Destination[] = actor?.owner ? [
    { href: "/", label: "Dashboard", icon: "overview" },
    { href: "/reports", label: "Reports", icon: "plans" },
  ] : [];
  const management: Destination[] = actor ? [
    ...(members ? [
      { href: "/members", label: "Members", icon: "members" as const },
      { href: "/transactions", label: "Payments", icon: "receipt" as const },
      { href: "/attendance", label: "Attendance", icon: "clock" as const },
      { href: "/attendance/scanner", label: "QR Scanner", icon: "scanner" as const },
    ] : []),
  ] : [];
  const account: Destination[] = actor ? [
    { href: "/settings", label: "Settings", icon: "team" as const },
    ...(members ? [{ href: "/pilot", label: "Historical Pilot Evidence", icon: "shield" as const }] : []),
  ] : [];
  const current = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const destination = [...overview, ...management, ...account].findLast(item => item.href && current(item.href));
  const isCurrent = (href: string) => destination?.href === href;
  const label = destination?.label ?? "Workspace";
  const content = <div className={actor ? "app-workspace min-w-0 flex-1" : ""}>
    <header className="workspace-header"><div className="flex min-h-18 items-center justify-between gap-1 px-3 py-2 sm:gap-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3 text-xs">{actor && <SidebarTrigger />}<span className="hidden truncate font-semibold md:inline">{pathname.startsWith("/join/") ? "Member registration" : actor ? label : "Operator access"}</span></div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3"><LiveClock /><ThemeControl />{actor && <AccountControl name={actor.name} owner={actor.owner} />}</div>
    </div>
    </header>
    <main key={pathname} id="main" tabIndex={-1} className={`workspace-content ${actor ? "pb-28 lg:pb-12" : "py-12"}`}>{children}</main>
    {actor && management.length > 0 && <nav aria-label="Quick navigation" className="mobile-bottom-nav">{management.map(item => <Link key={item.href} href={item.href!} aria-current={isCurrent(item.href!) ? "page" : undefined} className={isCurrent(item.href!) ? "text-brand-foreground" : "text-muted-foreground"}><WorkspaceIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>}
  </div>;
  return actor ? <SidebarProvider style={{ "--sidebar-width": "16rem" } as React.CSSProperties}>
    <AppSidebar actor={actor} groups={[{ title: "Quick Actions", items: actions, actions: true }, { title: "Overview", items: overview }, { title: "Management", items: management }]} current={isCurrent} />
    {content}
  </SidebarProvider> : content;
}

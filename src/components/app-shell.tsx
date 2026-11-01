"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControl } from "./theme-control";
import { SignOut } from "./sign-out";
import { WorkspaceIcon } from "./workspace-icon";
import { AppSidebar, type Destination } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";

type ShellActor = { name: string; gym: string; owner: boolean; members: boolean; cash: boolean };
export function AppShell({ actor, children }: { actor: ShellActor | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const members = actor && (actor.owner || actor.members);
  const actions: Destination[] = actor ? [
    ...(members ? [{ href: "/members#member-name", label: "Add Member", icon: "plus" as const }] : []),
    ...(members && (actor.owner || actor.cash) ? [{ href: "/operate", label: "Record Cash Payment", icon: "wallet" as const }] : []),
  ] : [];
  const workspace: Destination[] = actor ? [
    ...(actor.owner ? [{ href: "/", label: "Dashboard", icon: "overview" as const }] : []),
    ...(members ? [
      { href: "/operate", label: "Front Desk", icon: "operate" as const },
      { href: "/members", label: "Members", icon: "members" as const },
      { href: "/transactions", label: "Payments", icon: "receipt" as const },
    ] : []),
  ] : [];
  const administration: Destination[] = actor ? [
    ...(actor.owner ? [{ href: "/plans", label: "Plans & pricing", icon: "plans" as const }] : []),
    { href: "/team", label: actor.owner ? "Team & access" : "Your account", icon: "team" as const },
    ...(members ? [{ href: "/pilot", label: "Historical pilot evidence", icon: "shield" as const }] : []),
  ] : [];
  const current = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const label = [...workspace, ...administration].find(item => current(item.href))?.label ?? "Workspace";
  const content = <div className={actor ? "app-workspace min-w-0 flex-1" : ""}>
    <header className="workspace-header"><div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-3 text-xs">{actor && <SidebarTrigger />}<span className="hidden text-muted-foreground sm:inline">FORM & FUNCTION</span><span className="hidden text-muted-foreground sm:inline">/</span><span className="font-semibold">{actor ? label : "Operator access"}</span></div>
      <div className="flex flex-wrap items-center gap-3"><ThemeControl />{actor && <><span className="rounded border border-border bg-muted px-2 py-1 text-xs font-medium">{actor.owner ? "Owner" : "Staff"}</span><SignOut /></>}</div>
    </div>
    </header>
    <main key={pathname} id="main" tabIndex={-1} className={`workspace-content ${actor ? "pb-28 lg:pb-12" : "py-12"}`}>{children}</main>
    {actor && workspace.length > 0 && <nav aria-label="Quick navigation" className="mobile-bottom-nav">{workspace.filter(item => item.href !== "/").slice(0, 5).map(item => <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined} className={current(item.href) ? "text-brand-foreground" : "text-muted-foreground"}><WorkspaceIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>}
  </div>;
  return actor ? <SidebarProvider style={{ "--sidebar-width": "19rem" } as React.CSSProperties}>
    <AppSidebar actor={actor} groups={[{ title: "Quick Actions", items: actions, actions: true }, { title: "Workspace", items: workspace }, { title: "Management", items: administration }]} current={current} />
    {content}
  </SidebarProvider> : content;
}

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
  const workspace: Destination[] = actor ? [
    ...(actor.owner ? [{ href: "/", label: "Overview", icon: "overview" as const }] : []),
    ...(members ? [
      { href: "/operate", label: "Operate", icon: "operate" as const },
      { href: "/members", label: "Members", icon: "members" as const },
      { href: "/transactions", label: "Transactions", icon: "receipt" as const },
    ] : []),
    ...(actor.owner || actor.cash || actor.members ? [{ href: "/closing", label: "Daily closing", icon: "closing" as const }] : []),
    ...(members ? [{ href: "/investigations", label: "Exceptions", icon: "alert" as const }] : []),
  ] : [];
  const administration: Destination[] = actor ? [
    ...(members ? [
      { href: "/digital", label: "Digital collections", icon: "wallet" as const },
      { href: "/outage-receipts", label: "Outage receipts and custody", icon: "receipt" as const },
      { href: "/pilot", label: "Pilot evidence review", icon: "shield" as const },
    ] : []),
    ...(actor.owner ? [{ href: "/plans", label: "Plans and pricing", icon: "plans" as const }] : []),
    { href: "/team", label: actor.owner ? "Team & access" : "Your account", icon: "team" as const },
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
    {actor && workspace.length > 0 && <nav aria-label="Quick navigation" className="mobile-bottom-nav">{workspace.filter(item => item.href !== "/").slice(0, 5).map(item => <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined} className={current(item.href) ? "text-brand-foreground" : "text-muted-foreground"}><WorkspaceIcon name={item.icon} /><span>{item.label === "Transactions" ? "Payments" : item.label === "Daily closing" ? "Closing" : item.label}</span></Link>)}</nav>}
  </div>;
  return actor ? <SidebarProvider style={{ "--sidebar-width": "19rem" } as React.CSSProperties}>
    <AppSidebar actor={actor} groups={[{ title: "Workspace", items: workspace }, { title: "Management", items: administration }]} current={current} />
    {content}
  </SidebarProvider> : content;
}

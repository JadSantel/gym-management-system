"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControl } from "./theme-control";
import { SignOut } from "./sign-out";
import { WorkspaceIcon } from "./workspace-icon";

type ShellActor = { name: string; gym: string; owner: boolean; members: boolean; cash: boolean };
type Destination = { href: string; label: string; icon: React.ComponentProps<typeof WorkspaceIcon>["name"] };
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
  const navigation = <nav aria-label="Main navigation" className="space-y-7">{[{ title: "Workspace", items: workspace }, { title: "Management", items: administration }].filter(group => group.items.length).map(group => <div key={group.title}>
    <p className="nav-section">{group.title}</p><ul className="space-y-1">{group.items.map(item => <li key={item.href}><Link href={item.href} aria-current={current(item.href) ? "page" : undefined} className={`nav-link ${current(item.href) ? "is-current" : ""}`}><WorkspaceIcon name={item.icon} />{item.label}</Link></li>)}</ul>
  </div>)}</nav>;
  return <div className={actor ? "app-workspace lg:pl-56" : ""}>
    {actor && <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-border bg-sidebar px-3 pb-5 pt-6 lg:flex">
      <Link href="/" className="brand-lockup"><span className="brand-mark"><WorkspaceIcon name="operate" /></span><span><strong>FORM & FUNCTION</strong><small>GYM OPERATIONS</small></span></Link>
      <div className="grow overflow-y-auto pt-6">{navigation}</div>
      <div className="mt-6 border-t border-border px-2 pt-4"><div className="flex items-center gap-3"><span className="initial-avatar">{actor.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{actor.name}</p><p className="mt-1 text-xs text-muted-foreground">{actor.owner ? "Gym owner" : "Staff"}</p></div></div><p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><WorkspaceIcon name="shield" className="size-3.5" /> Synthetic development</p><p className="mt-1 break-words text-xs text-muted-foreground">{actor.gym}</p></div>
    </aside>}
    <header className="workspace-header"><div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-3 text-xs"><span className="hidden text-muted-foreground sm:inline">FORM & FUNCTION</span><span className="hidden text-muted-foreground sm:inline">/</span><span className="font-semibold">{actor ? label : "Operator access"}</span></div>
      <div className="flex flex-wrap items-center gap-3"><ThemeControl />{actor && <><span className="rounded border border-border bg-muted px-2 py-1 text-xs font-medium">{actor.owner ? "Owner" : "Staff"}</span><SignOut /></>}</div>
    </div>
      {actor && <details key={pathname} className="border-t border-border lg:hidden"><summary className="min-h-11 cursor-pointer px-5 py-3 text-sm font-medium">Navigation <span className="ml-2 text-muted-foreground">/ {label}</span></summary><div className="border-t border-border p-5">{navigation}</div></details>}
    </header>
    <main key={pathname} id="main" tabIndex={-1} className={`workspace-content ${actor ? "pb-28 lg:pb-12" : "py-12"}`}>{children}</main>
    {actor && workspace.length > 0 && <nav aria-label="Quick navigation" className="mobile-bottom-nav">{workspace.filter(item => item.href !== "/").slice(0, 5).map(item => <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined} className={current(item.href) ? "text-brand-foreground" : "text-muted-foreground"}><WorkspaceIcon name={item.icon} /><span>{item.label === "Transactions" ? "Payments" : item.label === "Daily closing" ? "Closing" : item.label}</span></Link>)}</nav>}
  </div>;
}

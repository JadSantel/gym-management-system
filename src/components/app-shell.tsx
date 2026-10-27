"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControl } from "@/components/theme-control";
import { SignOut } from "@/components/sign-out";
type ShellActor = { name: string; gym: string; owner: boolean; members: boolean; cash: boolean };
const paths = {
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  members: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  digital: "M2 5h20v14H2zM2 10h20M6 15h3",
  review: "M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16ZM16 16l6 6M10 6v4M10 13v1",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3",
  closing: "M3 4h18v17H3zM7 2v4M17 2v4M3 10h18M8 15l3 3 5-5",
  plans: "M4 3h16v18H4zM8 7h8M8 12h8M8 17h4",
} as const;
function NavIcon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0"><path d={paths[name]} /></svg>;
}
export function AppShell({ actor, children }: { actor: ShellActor | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const members = actor && (actor.owner || actor.members);
  const groups: { title: string; items: { href: string; label: string; icon: keyof typeof paths }[] }[] = actor ? [
    { title: "Workspace", items: [
      ...(members ? [{ href: "/members", label: "Members", icon: "members" as const }, { href: "/digital", label: "Digital collections", icon: "digital" as const }] : []),
      ...(actor.owner || actor.cash || actor.members ? [{ href: "/closing", label: "Daily closing", icon: "closing" as const }] : []),
    ] },
    { title: "Review & recovery", items: members ? [
      { href: "/investigations", label: "Payment investigations", icon: "review" as const },
      { href: "/outage-receipts", label: "Outage receipts and custody", icon: "receipt" as const },
      { href: "/pilot", label: "Pilot evidence review", icon: "review" as const },
    ] : [] },
    { title: "Administration", items: [
      ...(actor.owner ? [{ href: "/plans", label: "Plans and pricing", icon: "plans" as const }] : []),
      { href: "/", label: actor.owner ? "Team & access" : "Your account", icon: "team" as const },
    ] },
  ] : [];
  const navigation = <nav aria-label="Main navigation" className="space-y-6">{groups.filter(group => group.items.length).map(group => <div key={group.title}>
    <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{group.title}</p>
    <ul className="space-y-1">{group.items.map(item => {
      const current = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      return <li key={item.href}><Link href={item.href} aria-current={current ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${current ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <NavIcon name={item.icon} />{item.label}</Link></li>;
    })}</ul></div>)}</nav>;
  return <div className={actor ? "lg:pl-64" : ""}>
    {actor && <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
      <Link href="/" className="flex min-h-20 items-center gap-3 px-6 text-foreground"><span className="flex size-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">G</span><span className="text-lg font-semibold tracking-tight">Gym CRM</span></Link>
      <div className="mx-4 mb-7 border-y border-border px-2 py-4"><p className="break-words text-sm font-semibold">{actor.gym}</p><p className="mt-1 text-xs text-muted-foreground">Gym workspace</p></div>
      <div className="grow overflow-y-auto px-4 pb-6">{navigation}</div>
      <div className="border-t border-border p-6"><p className="break-words text-sm font-medium">{actor.name}</p><p className="mt-1 text-xs text-muted-foreground">{actor.owner ? "Owner" : "Staff"} · Individual account</p></div>
    </aside>}
    <header className="border-b border-border bg-card"><div className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="min-w-0"><p className="text-sm font-semibold">{actor ? actor.gym : "Gym CRM"}</p><p className="text-xs text-muted-foreground">Synthetic development</p></div>
      <div className="flex flex-wrap items-center gap-4"><ThemeControl />{actor && <SignOut />}</div>
    </div>
      {actor && <details key={pathname} className="group border-t border-border lg:hidden">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium marker:text-muted-foreground">Navigation <span className="ml-2 text-muted-foreground">/ {pathname === "/" ? actor.owner ? "Team & access" : "Your account" : groups.flatMap(group => group.items).find(item => pathname.startsWith(item.href) && item.href !== "/")?.label ?? "Workspace"}</span></summary>
        <div className="border-t border-border p-5">{navigation}</div>
      </details>}
    </header>
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1440px] px-5 py-8 outline-none sm:px-8 sm:py-10 lg:px-10">{children}</main>
  </div>;
}

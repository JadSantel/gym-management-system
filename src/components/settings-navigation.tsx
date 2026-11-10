"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Tags, Users } from "lucide-react";

export function SettingsNavigation({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/settings", label: "Profile", description: "Gym information", icon: Building2 },
    ...(owner ? [{ href: "/settings/plans", label: "Plans and Pricing", description: "Membership plans", icon: Tags }] : []),
    { href: "/settings/team", label: "Team and Access", description: owner ? "Operators and permissions" : "Your staff account", icon: Users },
  ];
  return <nav aria-label="Settings sections" className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2 lg:sticky lg:top-6">{items.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
    className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-brand-surface aria-[current=page]:text-brand-foreground">
    <Icon aria-hidden="true" className="size-5 shrink-0" /><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{description}</span></span>
  </Link>)}</nav>;
}

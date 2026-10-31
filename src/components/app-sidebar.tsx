"use client";

import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace-icon";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";

export type Destination = { href: string; label: string; icon: React.ComponentProps<typeof WorkspaceIcon>["name"] };

// sidebar-04's floating, grouped submenu layout with the real gym destinations.
export function AppSidebar({ actor, groups, current }: {
  actor: { name: string; gym: string; owner: boolean };
  groups: { title: string; items: Destination[] }[];
  current: (href: string) => boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const closeNavigation = () => setOpenMobile(false);
  return <Sidebar variant="floating">
    <SidebarHeader className="px-3 pt-4">
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="h-auto px-2 py-3">
        <Link href={actor.owner ? "/" : groups.flatMap(group => group.items)[0]?.href ?? "/team"} onClick={closeNavigation}>
          <span className="brand-mark shrink-0"><WorkspaceIcon name="operate" /></span>
          <span className="min-w-0"><strong className="block text-[13px] font-semibold">FORM & FUNCTION</strong><small className="mt-1 block text-[10px] tracking-wider text-muted-foreground">GYM OPERATIONS</small></span>
        </Link>
      </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <nav aria-label="Main navigation">
        <SidebarGroup><SidebarMenu className="gap-5">{groups.filter(group => group.items.length).map(group =>
          <SidebarMenuItem key={group.title}>
            <SidebarGroupLabel className="uppercase tracking-wider">{group.title}</SidebarGroupLabel>
            <SidebarMenuSub className="ml-0 border-l-0 px-1.5">{group.items.map(item =>
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={current(item.href)} className="h-auto min-h-11 translate-x-0 py-2 text-[13px] text-muted-foreground data-[active=true]:font-semibold data-[active=true]:text-brand-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible">
                  <Link href={item.href} aria-current={current(item.href) ? "page" : undefined} onClick={closeNavigation}>
                    <WorkspaceIcon name={item.icon} /><span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}</SidebarMenuSub>
          </SidebarMenuItem>
        )}</SidebarMenu></SidebarGroup>
      </nav>
    </SidebarContent>
    <SidebarFooter className="gap-4 border-t border-sidebar-border p-4">
      <div className="flex items-center gap-3"><span className="initial-avatar">{actor.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{actor.name}</p><p className="mt-1 text-xs text-muted-foreground">{actor.owner ? "Gym owner" : "Staff"}</p></div></div>
      <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><WorkspaceIcon name="shield" className="size-3.5" /> Synthetic development</p><p className="mt-1 break-words text-xs text-muted-foreground">{actor.gym}</p></div>
    </SidebarFooter>
  </Sidebar>;
}

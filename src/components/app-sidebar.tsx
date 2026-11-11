"use client";

import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace-icon";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type Destination = { href?: string; label: string; icon: React.ComponentProps<typeof WorkspaceIcon>["name"] };

// Official sidebar-01 group/menu structure, adapted to the gym's authorized destinations.
export function AppSidebar({ actor, groups, current }: {
  actor: { name: string; gym: string; owner: boolean };
  groups: { title: string; items: Destination[]; actions?: boolean }[];
  current: (href: string) => boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const closeNavigation = () => setOpenMobile(false);
  return <Sidebar>
    <SidebarHeader className="px-3 pt-4">
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="h-auto px-2 py-3">
        <Link href={actor.owner ? "/" : groups.filter(group => !group.actions).flatMap(group => group.items)[0]?.href ?? "/team"} onClick={closeNavigation}>
          <span className="brand-mark shrink-0"><WorkspaceIcon name="operate" /></span>
          <span className="min-w-0"><strong className="block text-sm font-semibold">Form & Function</strong><small className="mt-0.5 block truncate text-xs text-muted-foreground">{actor.gym}</small></span>
        </Link>
      </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <nav aria-label="Main navigation">
        {groups.filter(group => group.items.length).map(group =>
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{group.items.map(item =>
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton asChild isActive={!!item.href && !group.actions && current(item.href)} className="h-auto min-h-11 rounded-lg px-3 py-2 text-sm [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible">
                  {item.href ? <Link href={item.href} aria-current={!group.actions && current(item.href) ? "page" : undefined} onClick={closeNavigation}>
                    <WorkspaceIcon name={item.icon} /><span>{item.label}</span>
                  </Link> : <span aria-disabled="true"><WorkspaceIcon name={item.icon} /><span>{item.label} <span className="ml-1 text-xs">— Coming soon</span></span></span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        )}
      </nav>
    </SidebarContent>
    <SidebarFooter className="gap-4 border-t border-sidebar-border p-4">
      <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><WorkspaceIcon name="shield" className="size-3.5" /> Synthetic development</p><p className="mt-1 break-words text-xs text-muted-foreground">{actor.gym}</p></div>
    </SidebarFooter>
  </Sidebar>;
}

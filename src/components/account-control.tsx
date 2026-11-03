"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignOut } from "@/components/sign-out";
import { WorkspaceIcon } from "@/components/workspace-icon";
import type { Destination } from "@/components/app-sidebar";

export function AccountControl({ name, owner, destinations, current }: { name: string; owner: boolean; destinations: Destination[]; current: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const role = owner ? "Owner" : "Staff";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" aria-label={`Account: ${name}, ${role}`} className="min-w-11 shrink-0 flex-col gap-0.5 border-transparent bg-transparent px-1.5 py-1 sm:flex-row sm:gap-2.5 sm:px-2">
        <span aria-hidden="true" className="initial-avatar size-7! sm:size-9!">{name.split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("")}</span>
        <span className="min-w-0 text-left leading-tight">
          <span className="hidden max-w-40 truncate text-[13px] font-medium sm:block">{name}</span>
          <span className="block text-[11px] font-normal text-muted-foreground sm:mt-1 sm:text-xs">{role}</span>
        </span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground sm:block" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-64" aria-label="Operator account">
      <p className="break-words text-sm font-semibold">{name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{role}</p>
      <nav aria-label="Account navigation" className="mt-4 mb-3 space-y-1">{destinations.map(item => item.href && <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:text-brand-foreground"><WorkspaceIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SignOut />
    </PopoverContent>
  </Popover>;
}

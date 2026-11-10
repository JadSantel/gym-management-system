"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AccountControl({ name, owner }: { name: string; owner: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      router.replace("/login?signedOut=true"); router.refresh();
    } catch { setError("Unable to log out. Try again."); setBusy(false); }
  }
  const role = owner ? "Owner" : "Staff";
  return <><DropdownMenu modal={false} open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" aria-label={`Account: ${name}, ${role}`} className="min-w-11 shrink-0 flex-col gap-0.5 border-transparent bg-transparent px-1.5 py-1 sm:flex-row sm:gap-2.5 sm:px-2">
        <span aria-hidden="true" className="initial-avatar size-7! sm:size-9!">{name.split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("")}</span>
        <span className="min-w-0 text-left leading-tight">
          <span className="hidden max-w-40 truncate text-[13px] font-medium sm:block">{name}</span>
          <span className="block text-[11px] font-normal text-muted-foreground sm:mt-1 sm:text-xs">{role}</span>
        </span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 text-muted-foreground sm:block" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52" aria-label="Operator account" aria-busy={busy}>
      <DropdownMenuItem asChild disabled={busy} className="min-h-11"><Link href="/settings"><Settings aria-hidden="true" />Settings</Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={busy} className="min-h-11" aria-label={busy ? "Logging out…" : "Log out"} aria-describedby={error ? "account-logout-error" : undefined} onSelect={event => { event.preventDefault(); void logout(); }}><LogOut aria-hidden="true" /><span>{busy ? "Logging out…" : "Log out"}{error && <span id="account-logout-error" className="mt-1 block text-xs">{error}</span>}</span></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu><span role="alert" className="sr-only">{error}</span></>;
}

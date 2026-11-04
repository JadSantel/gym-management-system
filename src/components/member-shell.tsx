import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { ThemeControl } from "./theme-control";

export function MemberShell({ children, registration = false }: { children: React.ReactNode; registration?: boolean }) {
  return <div className="min-h-dvh bg-background text-foreground" data-member-page={registration ? "registration" : "dashboard"}>
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-18 max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex items-center gap-3"><Dumbbell aria-hidden="true" className="size-5 shrink-0 text-brand-foreground" /><span className="text-sm font-semibold">{registration ? "Member registration" : "Member area"}</span></div>
        <div className="flex shrink-0 items-center gap-1">{registration && <Link href="/member/login" aria-label="Member sign in" className="inline-flex min-h-11 items-center whitespace-nowrap px-2 text-sm underline underline-offset-4"><span className="hidden sm:inline">Member&nbsp;</span>Sign in</Link>}<ThemeControl /></div>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-8 outline-none sm:px-8 sm:py-12">{children}</main>
  </div>;
}

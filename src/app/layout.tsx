import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { getActor, IdentityError } from "@/lib/identity";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "Gym CRM", description: "Individual operator access for your gym." };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor(await headers()).catch(error => { if (error instanceof IdentityError) return null; throw error; });
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var v=localStorage.getItem('gym-appearance');var d=v==='dark'||(v!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}})()` }} /></head><body><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-card focus:p-3">Skip to content</a>
    <AppShell actor={actor ? { name: actor.operator.user.name, gym: actor.operator.gym.name, owner: actor.operator.role === "OWNER", members: actor.operator.canManageMembers, cash: actor.operator.canCollectCash } : null}>{children}</AppShell>
  </body></html>;
}

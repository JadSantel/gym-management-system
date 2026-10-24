import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Gym CRM", description: "Individual operator access for your gym." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-card focus:p-3">Skip to content</a>
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5"><span className="text-lg font-semibold tracking-tight">Gym CRM</span><span className="text-sm text-muted-foreground">Synthetic development</span></div></header>
    <main id="main" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
  </body></html>;
}

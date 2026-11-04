import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Form & Function | Gym CRM", description: "Gym operations, verified collections, and membership access." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var v=localStorage.getItem('gym-appearance');var d=v==='dark'||(v!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}})()` }} /></head><body><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-card focus:p-3">Skip to content</a>
    {children}
  </body></html>;
}

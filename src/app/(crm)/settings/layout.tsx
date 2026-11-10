import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getActor, IdentityError } from "@/lib/identity";
import { SettingsNavigation } from "@/components/settings-navigation";

export const dynamic = "force-dynamic";
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  return <>
    <div className="page-heading"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted"><Settings aria-hidden="true" className="size-5" /></span><div><h1>Settings</h1><p className="mt-2 text-sm text-muted-foreground">Manage your gym information and workspace.</p></div></div></div>
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-8"><SettingsNavigation owner={actor.operator.role === "OWNER"} /><div className="min-w-0">{children}</div></div>
  </>;
}

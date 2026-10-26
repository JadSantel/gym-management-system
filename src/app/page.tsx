import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, IdentityError } from "@/lib/identity";
import { OperatorSettings } from "@/components/operator-settings";
import { SignOut } from "@/components/sign-out";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Home() {
  const actor = await getActor(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  return <><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-sm font-semibold text-primary">{actor.operator.gym.name}</p><h1 className="text-3xl font-semibold tracking-tight">Welcome, {actor.operator.user.name}</h1><p className="mt-3 text-muted-foreground">Signed in as {actor.operator.role === "OWNER" ? "Owner" : "Staff"}. Your individual account is active.</p></div><SignOut /></div>
    {(actor.operator.role === "OWNER" || actor.operator.canManageMembers) && <><Link href="/members" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground">Find or create a member</Link><Link href="/investigations" className="ml-4 mt-6 inline-flex min-h-11 items-center underline">Payment investigations</Link></>}
    {actor.operator.role === "OWNER" && <Link href="/plans" className="ml-4 mt-6 inline-flex min-h-11 items-center underline">Plans and pricing</Link>}
    {(actor.operator.role === "OWNER" || actor.operator.canManageMembers) && <Link href="/digital" className="ml-4 mt-6 inline-flex min-h-11 items-center underline">Digital collections</Link>}
    {(actor.operator.role === "OWNER" || actor.operator.canManageMembers) && <Link href="/outage-receipts" className="ml-4 mt-6 inline-flex min-h-11 items-center underline">Outage receipts and custody</Link>}
    {actor.operator.role === "OWNER" ? <OperatorSettings /> : <p className="mt-8 rounded-xl border border-border bg-card p-6">Your gym account is ready. Ask your owner for the permissions needed for your work.</p>}
    {(actor.operator.role === "OWNER" || actor.operator.canCollectCash || actor.operator.canManageMembers) && <Link href="/closing" className="mt-6 inline-flex min-h-11 items-center underline">Close a business day</Link>}
    {(actor.operator.role === "OWNER" || actor.operator.canManageMembers) && <Link href="/pilot" className="ml-4 mt-6 inline-flex min-h-11 items-center underline">Pilot evidence review</Link>}
  </>;
}

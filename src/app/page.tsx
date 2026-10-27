import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, IdentityError } from "@/lib/identity";
import { OperatorSettings } from "@/components/operator-settings";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Home() {
  const actor = await getActor(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  const owner = actor.operator.role === "OWNER";
  return <>
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">{owner ? "Team & access" : "Your account"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Welcome, {actor.operator.user.name}. {owner ? "Manage your operators and the access they need." : "Your individual staff account is active."}</p></div>
      {owner && <a href="#staff-name" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Invite staff <span aria-hidden="true">+</span></a>}
    </div>
    {owner ? <OperatorSettings /> : <section className="rounded-xl border border-border bg-card p-6 sm:p-8" aria-labelledby="staff-account-title">
      <h2 id="staff-account-title" className="text-lg font-semibold">Ready for your shift</h2><p className="mt-2 text-sm text-muted-foreground">Your gym account is ready. Ask your owner for the permissions needed for your work.</p>
      {actor.operator.canManageMembers && <Link href="/members" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground">Find or create a member</Link>}
    </section>}
  </>;
}

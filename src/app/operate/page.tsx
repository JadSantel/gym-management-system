import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { findMembers } from "@/lib/members";
import { getActor, IdentityError } from "@/lib/identity";
import { MemberDirectory } from "@/components/member-directory";
import { WorkspaceIcon } from "@/components/workspace-icon";
export const dynamic = "force-dynamic";
export default async function OperatePage() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  const members = await findMembers(requestHeaders, "").catch(error => { if (error instanceof IdentityError) redirect("/team"); throw error; });
  return <><div className="page-heading"><div><h1>Front desk</h1><p>Welcome, {actor.operator.user.name}. Find a member, verify access, or collect a full membership payment.</p></div><a href="#member-name" className="action-link secondary"><WorkspaceIcon name="plus" />New membership</a></div>
    <div className="lookup-banner"><div className="relative z-1"><h2 className="text-[26px] font-semibold tracking-tight">Who&apos;s at the desk?</h2><p className="mt-2 text-sm text-muted-foreground">Search and open a profile to review access or prepare a payment.</p></div><a href="#member-name" className="action-link">Add member<WorkspaceIcon name="arrow" /></a><span aria-hidden="true" className="lookup-pattern" /></div>
    <MemberDirectory desk checkedAt={new Date().toISOString()} initial={members.map(member => ({ ...member, entitlements: member.entitlements.map(interval => ({ ...interval, startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() })) }))} />
  </>;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { findMembers } from "@/lib/members";
import { IdentityError } from "@/lib/identity";
import { MemberDirectory } from "@/components/member-directory";
export const dynamic = "force-dynamic";
export default async function MembersPage() {
  const members = await findMembers(await headers(), "").catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <><div className="page-heading"><div><h1>Members</h1><p>Membership records, current eligibility, and paid periods.</p></div><a className="action-link" href="#member-name">Add member <span aria-hidden="true">+</span></a></div><MemberDirectory checkedAt={new Date().toISOString()} initial={members.map(member => ({ ...member, entitlements: member.entitlements.map(interval => ({ ...interval, startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString() })) }))} /></>;
}

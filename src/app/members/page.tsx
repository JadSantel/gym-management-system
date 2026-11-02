import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { memberDirectory } from "@/lib/members";
import { IdentityError } from "@/lib/identity";
import { MemberDirectory } from "@/components/member-directory";
export const dynamic = "force-dynamic";
export default async function MembersPage() {
  const data = await memberDirectory(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <><div className="page-heading"><div><h1>Members</h1><p>Find a member, review their membership, and open payment details.</p></div><a className="action-link" href="#member-name">Add member <span aria-hidden="true">+</span></a></div><MemberDirectory checkedAt={data.checkedAt} initial={data.members} /></>;
}

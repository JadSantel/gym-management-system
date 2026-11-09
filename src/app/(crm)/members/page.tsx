import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { memberDirectory } from "@/lib/members";
import { IdentityError } from "@/lib/identity";
import { MemberDirectory } from "@/components/member-directory";
export const dynamic = "force-dynamic";
export default async function MembersPage() {
  const data = await memberDirectory(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <MemberDirectory checkedAt={data.checkedAt} initial={data.members} />;
}

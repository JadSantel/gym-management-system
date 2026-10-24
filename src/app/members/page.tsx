import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { findMembers } from "@/lib/members";
import { IdentityError } from "@/lib/identity";
import { MemberDirectory } from "@/components/member-directory";
export const dynamic = "force-dynamic";
export default async function MembersPage() {
  const members = await findMembers(await headers(), "").catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <><Link href="/" className="text-sm underline">Back to overview</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight">Members</h1><p className="mt-3 text-muted-foreground">Find the right person before recording a membership.</p><MemberDirectory initial={members} /></>;
}

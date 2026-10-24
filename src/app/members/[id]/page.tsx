import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
export const dynamic = "force-dynamic";
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await inGym(await headers(), "MEMBERS", async tx => tx.member.findUnique({ where: { id: uuid(id) } })).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400) notFound(); redirect("/"); } throw error;
  });
  if (!member) notFound();
  return <><Link href="/members" className="text-sm underline">Back to members</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight">{member.fullName}</h1><p className="mt-3 break-all text-sm text-muted-foreground">Member reference: {member.id}</p>
    <section className="mt-8 rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">No confirmed membership</h2><p className="mt-2 text-muted-foreground">Creating a member does not grant admission. A verified full payment is required.</p></section>
  </>;
}

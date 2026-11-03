import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { memberQr } from "@/lib/attendance";
import { IdentityError } from "@/lib/identity";
import { MemberQr } from "@/components/member-qr";
export const dynamic = "force-dynamic";
export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qr = await memberQr(await headers(), id).catch(error => { if (error instanceof IdentityError) { if (error.status === 404 || error.status === 400) notFound(); redirect("/"); } throw error; });
  return <><div className="page-heading print:hidden"><div><Link href={`/members/${id}`} className="text-link">Back to member profile</Link><h1 className="mt-3">Member QR</h1><p>Issue once, retain across renewals, replace only when needed.</p></div><Link href="/attendance/scanner" className="action-link">Open scanner</Link></div><div className="mx-auto max-w-2xl"><MemberQr memberId={id} initial={qr} /></div></>;
}

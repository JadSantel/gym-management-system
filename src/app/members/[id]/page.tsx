import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { ChargePreview } from "@/components/charge-preview";
export const dynamic = "force-dynamic";
export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ charge?: string }> }) {
  const { id } = await params;
  const { charge: chargeId } = await searchParams;
  const data = await inGym(await headers(), "MEMBERS", async (tx, actor) => {
    const member = await tx.member.findUnique({ where: { id: uuid(id) } });
    if (!member) return null;
    const plans = await tx.plan.findMany({ orderBy: { durationDays: "asc" } });
    const charge = chargeId ? await tx.charge.findFirst({ where: { id: uuid(chargeId), memberId: member.id }, include: { plan: { select: { version: true } }, preparer: { select: { user: { select: { name: true } } } } } }) : null;
    if (chargeId && !charge) throw new IdentityError(404, "Charge preview unavailable.");
    return { member, plans, charge, canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
  }).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400 || error.status === 404) notFound(); redirect("/"); } throw error;
  });
  if (!data) notFound();
  const { member, plans, charge } = data;
  return <><Link href="/members" className="text-sm underline">Back to members</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight">{member.fullName}</h1><p className="mt-3 break-all text-sm text-muted-foreground">Member reference: {member.id}</p>
    <section className="mt-8 rounded-xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">No confirmed membership</h2><p className="mt-2 text-muted-foreground">Creating a member does not grant admission. A verified full payment is required.</p></section>
    <ChargePreview memberId={member.id} memberName={member.fullName} canPrepare={data.canPrepare}
      plans={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))}
      saved={charge ? { id: charge.id, planName: charge.planName, durationDays: charge.durationDays, priceCentavos: charge.priceCentavos,
        intendedStart: charge.intendedStart.toISOString(), intendedEnd: charge.intendedEnd.toISOString(), preparedAt: charge.preparedAt.toISOString(),
        preparerName: charge.preparer.user.name, priceChanged: charge.planVersion !== charge.plan.version } : null} />
  </>;
}

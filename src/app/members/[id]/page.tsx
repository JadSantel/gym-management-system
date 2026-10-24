import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { ChargePreview } from "@/components/charge-preview";
import { assessEligibility } from "@/lib/eligibility";
export const dynamic = "force-dynamic";
export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ charge?: string }> }) {
  const { id } = await params;
  const { charge: chargeId } = await searchParams;
  const data = await inGym(await headers(), "MEMBERS", async (tx, actor) => {
    const member = await tx.member.findUnique({ where: { id: uuid(id) } });
    if (!member) return null;
    const plans = await tx.plan.findMany({ orderBy: { durationDays: "asc" } });
    const payments = await tx.payment.findMany({ where: { memberId: member.id }, orderBy: { collectedAt: "desc" }, include: {
      collector: { select: { user: { select: { name: true } } } },
      verifier: { select: { user: { select: { name: true } } } },
      charge: { select: { planName: true, durationDays: true } }, period: true, receipt: true,
    } });
    const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: member.id, isCurrentProjection: true }, orderBy: { startsAt: "asc" } });
    const charge = chargeId ? await tx.charge.findFirst({ where: { id: uuid(chargeId), memberId: member.id }, include: { plan: { select: { version: true } }, preparer: { select: { user: { select: { name: true } } } } } }) : null;
    if (chargeId && !charge) throw new IdentityError(404, "Charge preview unavailable.");
    return { member, plans, charge, payments, intervals, recoveryScope: `${actor.operator.gymId}:${actor.operator.id}`, canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
  }).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400 || error.status === 404) notFound(); redirect("/"); } throw error;
  });
  if (!data) notFound();
  const { member, plans, charge, payments, intervals } = data;
  const checkedAt = new Date();
  const eligibility = assessEligibility(intervals, checkedAt);
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
  const status = eligibility.status === "ELIGIBLE" ? "Eligible" : eligibility.status === "SCHEDULED" ? "Not eligible yet" : "Not eligible";
  return <><Link href="/members" className="text-sm underline">Back to members</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight">{member.fullName}</h1><p className="mt-3 break-all text-sm text-muted-foreground">Member reference: {member.id}</p>
    <section className="mt-8 rounded-xl border border-border bg-card p-6" aria-labelledby="membership-access-title"><h2 id="membership-access-title" className="text-xl font-semibold">Membership access</h2><p className="mt-3 text-2xl font-semibold" aria-live="polite">{status}</p><p className="mt-1 text-muted-foreground">{eligibility.reason}</p>
      {eligibility.interval && <p className="mt-4 text-sm">{eligibility.status === "SCHEDULED" ? "Scheduled paid period" : eligibility.status === "EXPIRED" ? "Most recent paid period" : "Current paid period"}: {pht.format(eligibility.interval.startsAt)} PHT inclusive to {pht.format(eligibility.interval.endsAt)} PHT exclusive.</p>}
      <p className="mt-3 text-sm text-muted-foreground">Checked {pht.format(checkedAt)} PHT. Payment previews and unverified payments do not grant normal access.</p></section>
    <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="payment-history-title"><h2 id="payment-history-title" className="text-xl font-semibold">Payment history</h2>
      {payments.length ? <ol className="mt-4 divide-y divide-border">{payments.map(payment => <li key={payment.id} className="py-5 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h3 className="font-semibold">{payment.charge.planName} · {payment.charge.durationDays} days · {payment.method}</h3><strong className="tabular-nums">₱{(payment.amountCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Collected by</dt><dd>{payment.collector.user.name} · {pht.format(payment.collectedAt)} PHT</dd></div><div><dt className="text-muted-foreground">Entry recorded</dt><dd>{pht.format(payment.enteredAt)} PHT</dd></div><div><dt className="text-muted-foreground">Verified by</dt><dd>{payment.verifier.user.name} · {pht.format(payment.verifiedAt)} PHT</dd></div><div><dt className="text-muted-foreground">Paid period</dt><dd>{payment.period ? `${pht.format(payment.period.startsAt)} PHT inclusive to ${pht.format(payment.period.endsAt)} PHT exclusive` : "Unavailable"}</dd></div></dl>
        {payment.receipt && <p className="mt-3 text-sm">Payment reference: <span className="break-all font-medium">{payment.reference}</span> · <Link className="font-semibold underline" href={`/receipts/${payment.receipt.id}`}>View receipt {payment.receipt.reference}</Link></p>}
      </li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">No confirmed payments recorded.</p>}
    </section>
    <ChargePreview key={`${member.id}:${charge?.id ?? "no-preview"}`} memberId={member.id} memberName={member.fullName} canPrepare={data.canPrepare} recoveryScope={data.recoveryScope}
      plans={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))}
      saved={charge ? { id: charge.id, planName: charge.planName, durationDays: charge.durationDays, priceCentavos: charge.priceCentavos,
        intendedStart: charge.intendedStart.toISOString(), intendedEnd: charge.intendedEnd.toISOString(), preparedAt: charge.preparedAt.toISOString(),
        preparerName: charge.preparer.user.name, priceChanged: charge.planVersion !== charge.plan.version } : null} />
  </>;
}

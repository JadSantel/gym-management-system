import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { memberQuerySchema, recordParamsSchema } from "@/lib/route-schema";
import { IdentityError } from "@/lib/identity";
import { ChargePreview } from "@/components/charge-preview";
import { DigitalClaimForm } from "@/components/digital-payments";
import { assessEligibility, remainingActiveTime } from "@/lib/eligibility";
export const dynamic = "force-dynamic";
export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ charge?: string | string[] }> }) {
  const rawParams = await params;
  const rawQuery = await searchParams;
  const data = await inGym(await headers(), "MEMBERS", async (tx, actor) => {
    const parsed = recordParamsSchema.safeParse({ id: rawParams.id });
    const query = memberQuerySchema.safeParse({ charge: rawQuery.charge });
    if (!parsed.success || !query.success) throw new IdentityError(400, "Invalid record reference.");
    const chargeId = query.data.charge;
    const member = await tx.member.findUnique({ where: { id: parsed.data.id } });
    if (!member) return null;
    const plans = await tx.plan.findMany({ orderBy: { durationDays: "asc" } });
    const payments = await tx.payment.findMany({ where: { memberId: member.id }, orderBy: { collectedAt: "desc" }, include: {
      collector: { select: { user: { select: { name: true } } } },
      verifier: { select: { user: { select: { name: true } } } },
      charge: { select: { planName: true, durationDays: true } }, period: true, receipt: true,
    } });
    const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: member.id, isCurrentProjection: true }, orderBy: { startsAt: "asc" } });
    const charge = chargeId ? await tx.charge.findFirst({ where: { id: chargeId, memberId: member.id }, include: { plan: { select: { version: true } }, preparer: { select: { user: { select: { name: true } } } } } }) : null;
    if (chargeId && !charge) throw new IdentityError(404, "Charge preview unavailable.");
    const accounts = await tx.receivingAccount.findMany({ orderBy: { label: "asc" } });
    const memberCharges = await tx.charge.findMany({ where: { memberId: member.id }, select: { id: true } });
    const claims = await tx.digitalClaim.findMany({ where: { chargeId: { in: memberCharges.map(row => row.id) } } });
    const settlements = await tx.digitalSettlement.findMany({ where: { claimId: { in: claims.map(claim => claim.id) } } });
    const flags = await tx.paymentFlag.findMany({ where: { paymentId: { in: payments.map(payment => payment.id) } } });
    const adjustments = await tx.investigationEvent.findMany({ where: { paymentId: { in: payments.map(payment => payment.id) }, kind: { in: ["RECOVER", "EXECUTE_APPROVED"] } } });
    const refunds = await tx.investigationEvent.findMany({ where: { kind: "SETTLE", executionEventId: { in: adjustments.map(event => event.id) } } });
    return { member, plans, charge, payments, intervals, accounts, claims, settlements, flags, adjustments, refunds, recoveryScope: `${actor.operator.gymId}:${actor.operator.id}`, canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
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
      {eligibility.interval && eligibility.status !== "SCHEDULED" && <p className="mt-4 text-sm">{eligibility.status === "EXPIRED" ? "Most recent paid period" : "Current paid period"}: {pht.format(eligibility.interval.startsAt)} PHT inclusive to {pht.format(eligibility.interval.endsAt)} PHT exclusive.</p>}
      {eligibility.status === "ELIGIBLE" && <>
        <p className="mt-3 text-sm tabular-nums">Remaining in current paid period: {remainingActiveTime(eligibility.interval, checkedAt)} (rounded down at check time).</p>
        <p className="mt-2 text-sm text-muted-foreground">{intervals.some(interval => interval.startsAt > checkedAt) ? "Another advance renewal is available once the scheduled paid period starts." : "Optional advance renewal preserves this paid time and starts at the current period's exact end."}</p>
      </>}
      {intervals.filter(interval => interval.startsAt > checkedAt).map(interval => <p key={interval.id} className="mt-4 text-sm">Scheduled paid period: {pht.format(interval.startsAt)} PHT inclusive to {pht.format(interval.endsAt)} PHT exclusive. Fully paid; access from this period begins at its start.</p>)}
      <p className="mt-3 text-sm text-muted-foreground">Checked <time dateTime={checkedAt.toISOString()}>{pht.format(checkedAt)} PHT</time>. Payment previews and unverified payments do not grant normal access.</p></section>
    <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="payment-history-title"><h2 id="payment-history-title" className="text-xl font-semibold">Payment history</h2>
      <Link href={`/investigations?memberId=${member.id}`} className="mt-3 inline-block text-sm underline">Investigate claims or request owner correction review</Link>
      {data.claims.filter(claim => !data.settlements.some(settlement => settlement.claimId === claim.id)).map(claim => <p key={claim.id} className="mt-3 text-sm">Pending digital transfer: <span className="break-all">{claim.transactionReference}</span>. No new access granted. <Link href="/digital" className="underline">Review transfer claim</Link></p>)}
      {payments.length ? <ol className="mt-4 divide-y divide-border">{payments.map(payment => <li key={payment.id} className="py-5 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h3 className="font-semibold">{payment.charge.planName} · {payment.charge.durationDays} days · {payment.method}</h3><strong className="tabular-nums">₱{(payment.amountCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Collected by</dt><dd>{payment.collector.user.name} · {pht.format(payment.collectedAt)} PHT</dd></div><div><dt className="text-muted-foreground">Entry recorded</dt><dd>{pht.format(payment.enteredAt)} PHT</dd></div><div><dt className="text-muted-foreground">Verified by</dt><dd>{payment.verifier.user.name} · {pht.format(payment.verifiedAt)} PHT</dd></div><div><dt className="text-muted-foreground">Paid period</dt><dd>{payment.period ? `${pht.format(payment.period.startsAt)} PHT inclusive to ${pht.format(payment.period.endsAt)} PHT exclusive` : "Unavailable"}</dd></div></dl>
        {payment.receipt && <p className="mt-3 text-sm">Payment reference: <span className="break-all font-medium">{payment.reference}</span> · <Link className="font-semibold underline" href={`/receipts/${payment.receipt.id}`}>View receipt {payment.receipt.reference}</Link></p>}
        {data.flags.filter(flag => flag.paymentId === payment.id).map(flag => <p key={flag.id} className="mt-3 font-semibold">Owner review required: {flag.reason}. No automatic refund or access change.</p>)}
        {data.adjustments.filter(event => event.paymentId === payment.id).map(event => <p key={event.id} className="mt-3 break-words text-sm"><Link className="font-semibold underline" href={`/investigations/${event.caseId}#event-${event.id}`}>{event.kind === "RECOVER" ? "Recovered original collection" : "Linked owner adjustment"}</Link>: {data.refunds.some(refund => refund.executionEventId === event.id) ? "External refund settlement verified" : event.outcome}.
          {event.accessOutcome && <> Approved access outcome: {event.accessOutcome}, effective {pht.format(event.effectiveAt!)} PHT.</>} Original payment and paid period above are preserved; current access is shown separately.</p>)}
      </li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">No confirmed payments recorded.</p>}
    </section>
    <ChargePreview key={`${member.id}:${charge?.id ?? "no-preview"}`} memberId={member.id} memberName={member.fullName} canPrepare={data.canPrepare} recoveryScope={data.recoveryScope}
      plans={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))}
      saved={charge ? { id: charge.id, planName: charge.planName, durationDays: charge.durationDays, priceCentavos: charge.priceCentavos,
        intendedStart: charge.intendedStart.toISOString(), intendedEnd: charge.intendedEnd.toISOString(), preparedAt: charge.preparedAt.toISOString(),
        preparerName: charge.preparer.user.name, priceChanged: charge.planVersion !== charge.plan.version } : null} />
    {charge && data.canPrepare && !data.claims.some(claim => claim.chargeId === charge.id) && !payments.some(payment => payment.chargeId === charge.id) && <DigitalClaimForm chargeId={charge.id} amountCentavos={charge.priceCentavos} accounts={data.accounts} />}
  </>;
}

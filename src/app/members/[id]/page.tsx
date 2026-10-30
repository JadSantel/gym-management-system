import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { memberQuerySchema, recordParamsSchema } from "@/lib/route-schema";
import { IdentityError } from "@/lib/identity";
import { ChargePreview } from "@/components/charge-preview";
import { assessEligibility, remainingActiveTime } from "@/lib/eligibility";
import { LegacyAccess } from "@/components/legacy-access";
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
    const outageEntries = await tx.outageEntry.findMany({ where: { memberId: member.id }, orderBy: { collectedAt: "desc" } });
    const outageConfirmations = await tx.outageConfirmation.findMany({ where: { entryId: { in: outageEntries.map(entry => entry.id) } } });
    const legacyRecords = await tx.legacyRecord.findMany({ where: { memberId: member.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const legacyActors = await tx.operator.findMany({ where: { id: { in: legacyRecords.map(row => row.actorId) } }, select: { id: true, user: { select: { name: true } } } });
    return { member, plans, charge, payments, intervals, accounts, claims, settlements, flags, adjustments, refunds, outageEntries, outageConfirmations, legacyRecords, legacyActors, owner: actor.operator.role === "OWNER", recoveryScope: `${actor.operator.gymId}:${actor.operator.id}`, canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
  }).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400 || error.status === 404) notFound(); redirect("/"); } throw error;
  });
  if (!data) notFound();
  const { member, plans, charge, payments, intervals } = data;
  const checkedAt = new Date();
  const eligibility = assessEligibility(intervals, checkedAt);
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
  const queued = intervals.some(interval => interval.startsAt > checkedAt);
  const status = eligibility.status === "ELIGIBLE" ? "Eligible" : eligibility.status === "SCHEDULED" ? "Not eligible yet" : "Not eligible";
  return <><div className="page-heading"><div><Link href="/members" className="text-link">Back to members</Link><h1 className="mt-3">Member profile</h1><p>One place for access, membership dates, and payment records.</p></div><div className="flex flex-wrap gap-2">{queued || !data.canPrepare ? <button type="button" disabled className="action-link cursor-not-allowed opacity-50" aria-describedby={queued ? "renewal-blocked" : undefined}>Renew membership</button> : <a className="action-link" href="#membership-payment">Renew membership</a>}<Link href="/operate" className="action-link secondary">Back to desk</Link></div></div>
    <div className="panel mb-4 flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="initial-avatar" aria-hidden="true">{member.fullName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight">{member.fullName}</h2><p className="mt-1 break-all text-xs text-muted-foreground">Member reference: {member.id}</p></div></div><span className={`status-label ${eligibility.status === "ELIGIBLE" ? "success" : eligibility.status === "SCHEDULED" ? "attention" : "danger"}`}>{status}</span></div>
    <nav aria-label="Member sections" className="mb-4 flex flex-wrap gap-2"><a className="action-link secondary" href="#member-overview">Overview</a><a className="action-link secondary" href="#member-payments">Payments</a><a className="action-link secondary" href="#membership-payment">Membership payment</a><a className="action-link secondary" href="#member-evidence">Historical evidence</a></nav>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]"><div className="min-w-0">
    <section id="member-overview" className="panel" aria-labelledby="membership-access-title"><h2 id="membership-access-title" className="panel-title">Membership access</h2><p className={`mt-4 status-label ${eligibility.status === "ELIGIBLE" ? "success" : eligibility.status === "SCHEDULED" ? "attention" : "danger"}`} aria-live="polite">{status}</p><p className="mt-1 text-muted-foreground">{eligibility.reason}</p>
      {eligibility.interval && eligibility.status !== "SCHEDULED" && <p className="mt-4 text-sm">{eligibility.interval.legacyRecordId ? "Approved historical interval" : eligibility.status === "EXPIRED" ? "Most recent paid period" : "Current paid period"}: {pht.format(eligibility.interval.startsAt)} PHT inclusive to {pht.format(eligibility.interval.endsAt)} PHT exclusive.</p>}
      {eligibility.status === "ELIGIBLE" && <>
        <p className="mt-3 text-sm tabular-nums">Remaining in current {eligibility.interval.legacyRecordId ? "historical interval" : "paid period"}: {remainingActiveTime(eligibility.interval, checkedAt)} (rounded down at check time).</p>
        <p className="mt-2 text-sm text-muted-foreground">{intervals.some(interval => interval.startsAt > checkedAt) ? "Another advance renewal is available once the scheduled paid period starts." : eligibility.interval.legacyRecordId ? "Optional advance renewal preserves this historical access and starts at its exact end." : "Optional advance renewal preserves this paid time and starts at the current period's exact end."}</p>
      </>}
      {intervals.filter(interval => interval.startsAt > checkedAt).map(interval => <p key={interval.id} className="mt-4 text-sm">Scheduled paid period: {pht.format(interval.startsAt)} PHT inclusive to {pht.format(interval.endsAt)} PHT exclusive. Fully paid; access from this period begins at its start.</p>)}
      <p className="mt-3 text-sm text-muted-foreground">Checked <time dateTime={checkedAt.toISOString()}>{pht.format(checkedAt)} PHT</time>. Payment previews and unverified payments do not grant normal access.</p></section>
    <section id="member-payments" className="panel mt-4" aria-labelledby="payment-history-title"><h2 id="payment-history-title" className="panel-title">Payment history</h2>
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
    </div><aside className="panel" aria-labelledby="front-desk-actions"><h2 id="front-desk-actions" className="panel-title">Front-desk actions</h2><p className={`mt-4 rounded-md p-4 text-sm ${eligibility.status === "ELIGIBLE" ? "bg-success-surface text-success" : "bg-attention-surface text-attention"}`}>{eligibility.status === "ELIGIBLE" ? "Eligible for normal admission. Current verified entitlement is effective." : "No currently effective entitlement. Unverified claims cannot grant paid access."}</p><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Queued paid period</dt><dd>{intervals.some(interval => interval.startsAt > checkedAt) ? "Yes" : "None"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Confirmed payments</dt><dd>{payments.length}</dd></div></dl>{queued ? <p id="renewal-blocked" className="mt-5 rounded-md bg-attention-surface p-3 text-sm text-attention">An advance renewal is already paid. Another sale is available once the scheduled paid period starts.</p> : <a href="#membership-payment" className="action-link mt-5 w-full">Review membership payment</a>}<p className="mt-4 text-xs leading-relaxed text-muted-foreground">One paid future period blocks another advance sale. Review the full charge and dates before collecting funds.</p></aside></div>
    <div id="membership-payment" className="scroll-mt-6">
    <ChargePreview key={`${member.id}:${charge?.id ?? "no-preview"}`} memberId={member.id} memberName={member.fullName} canPrepare={data.canPrepare} saleBlocked={queued} recoveryScope={data.recoveryScope} accounts={data.accounts} canClaim={!!charge && !data.claims.some(claim => claim.chargeId === charge.id) && !payments.some(payment => payment.chargeId === charge.id)}
      plans={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))}
      saved={charge ? { id: charge.id, planName: charge.planName, durationDays: charge.durationDays, priceCentavos: charge.priceCentavos,
        intendedStart: charge.intendedStart.toISOString(), intendedEnd: charge.intendedEnd.toISOString(), preparedAt: charge.preparedAt.toISOString(),
        preparerName: charge.preparer.user.name, priceChanged: charge.planVersion !== charge.plan.version } : null} />

    </div><div id="member-evidence" className="mt-7 scroll-mt-6">
    {data.outageEntries.length > 0 && <section className="mt-7 rounded-xl border border-border bg-card p-6" aria-labelledby="outage-history-title"><h2 id="outage-history-title" className="text-xl font-semibold">Paper outage history and separate visits</h2><ul className="mt-3 space-y-3">{data.outageEntries.map(entry => <li key={entry.id} className="break-words text-sm"><Link className="underline" href={`/outage-receipts#entry-${entry.id}`}>Paper receipt {entry.number}</Link> · {data.outageConfirmations.some(c => c.entryId === entry.id) ? "Independently verified; see linked payment history" : "Pending verification; no new normal entitlement"}. Collected {pht.format(entry.collectedAt)} PHT; paper issued {pht.format(entry.issuedAt)} PHT; recovery entered {pht.format(entry.enteredAt)} PHT.{entry.visitAt && <> One original provisional visit: {pht.format(entry.visitAt)} PHT, reference {entry.visitReference}. No second visit authorized by this receipt.</>}</li>)}</ul></section>}
    <LegacyAccess memberId={member.id} owner={data.owner} scope={data.recoveryScope}
      proposals={data.legacyRecords.filter(row => row.kind === "PREPARE" && !data.legacyRecords.some(decision => decision.proposalId === row.id)).map(row => ({ id: row.id, label: `${row.sourceReference} — ${row.uncertainty}` }))}
      records={data.legacyRecords.map(row => ({ id: row.id, label: `${row.kind} ${row.sourceReference}` }))} />
    {data.legacyRecords.length > 0 && <section className="mt-7" aria-labelledby="legacy-history-title"><h2 id="legacy-history-title" className="text-xl font-semibold">Historical evidence and immutable decisions</h2><ul className="mt-3 space-y-4">{data.legacyRecords.map(row => <li key={row.id} id={`legacy-${row.id}`} className="break-words rounded-md border border-border p-4 text-sm">
      <strong>{row.kind} · {row.sourceReference} · {row.uncertainty === "CERTAIN" ? row.kind === "APPROVE" ? "HISTORICAL_ENTITLEMENT" : "Awaiting/retained review" : "LEGACY_EXCEPTION"}</strong>
      <p>Source {row.sourceType}; corroboration {row.corroboratingReference ?? "missing"}. Meaning: {row.interpretation}. Claimed {row.claimedStart ?? "unknown"} to {row.claimedEnd ?? "unknown"}.</p>
      <p>{row.startsAt && row.endsAt ? `Reviewed interval: ${pht.format(row.startsAt)} PHT inclusive to ${pht.format(row.endsAt)} PHT exclusive.` : "No unambiguous interval established."}</p>
      <p>{row.kind === "PREPARE" ? "Entered" : "Decision signed"} {pht.format(row.createdAt)} PHT by {data.legacyActors.find(actor => actor.id === row.actorId)?.user.name ?? row.actorId}. {row.notes}</p>
      {row.proposalId && <p><Link className="underline" href={`#legacy-${row.proposalId}`}>Original proposal</Link></p>}{row.previousId && <p><Link className="underline" href={`#legacy-${row.previousId}`}>Previous preserved evidence</Link></p>}
      <p>No historical collection, payment receipt or unpaid balance was created.</p>
    </li>)}</ul></section>}
    </div>
  </>;
}

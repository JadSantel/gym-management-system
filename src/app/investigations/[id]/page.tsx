import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { investigationDetail } from "@/lib/investigations";
import { investigationGates, caseReasons } from "@/lib/investigation-schema";
import { IdentityError } from "@/lib/identity";
import { InvestigationActions } from "@/components/investigation-actions";
import { formatPhp } from "@/lib/money";
export const dynamic = "force-dynamic";
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await investigationDetail(await headers(), id).catch(error => { if (error instanceof IdentityError) { if (error.status === 404) notFound(); redirect("/"); } throw error; });
  const { record, events, member } = data;
  const latest = events.at(-1)!;
  return <><Link href={`/investigations?memberId=${member.id}`} className="underline">Back to this member&apos;s investigations</Link>
    <h1 className="mt-5 text-3xl font-semibold">{caseReasons[record.reason as keyof typeof caseReasons]}</h1>
    <p className="mt-3 break-all text-sm">Case: {record.id}</p><p className="mt-2"><Link href={`/members/${member.id}`} className="font-semibold underline">{member.fullName}</Link> · <strong>{latest.outcome}</strong></p>
    <p className="mt-3 break-words">Claim: {record.summary}</p>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Reported original collection</dt><dd>{record.originalCollectedAt ? `${pht.format(record.originalCollectedAt)} PHT` : "Unknown; no collection date inferred"}</dd></div>
      <div><dt className="text-muted-foreground">Claimed method / amount</dt><dd>{record.method} · {record.claimedCentavos ? formatPhp(record.claimedCentavos) : "Amount unknown"}</dd></div>
      <div><dt className="text-muted-foreground">Reported by / at</dt><dd>{data.operators.find(operator => operator.id === record.openedBy)?.user.name} · {pht.format(record.openedAt)} PHT</dd></div>
    </dl>
    <aside className="mt-5 space-y-3 rounded-md border border-border p-4 text-sm" aria-label="Execution policy gates"><p>{investigationGates.recovery}</p><p>{investigationGates.execution}</p></aside>
    <InvestigationActions recoveryScope={data.recoveryScope} caseId={record.id} revision={latest.revision} owner={data.owner}
      plans={data.plans.map(plan => [plan.id, `${plan.name} · ${formatPhp(plan.priceCentavos)} · ${plan.durationDays} days`])}
      collectors={data.operators.map(operator => [operator.id, operator.user.name])}
      approvals={events.filter(event => event.kind === "APPROVE_RECOVERY" && !events.some(recovered => recovered.kind === "RECOVER")).map(event => [event.id, `Approval ${event.revision} · ${formatPhp(event.amountCentavos!)}`])}
      approvedRequests={events.filter(event => event.kind === "REVIEW" && event.outcome === "APPROVED" && !events.some(executed => executed.kind === "EXECUTE_APPROVED" && executed.requestEventId === event.requestEventId)).map(event => [event.requestEventId!, `Approved request ${event.requestEventId}`])}
      executions={events.filter(event => event.kind === "EXECUTE_APPROVED" && event.outcome === "AWAITING_SETTLEMENT" && !events.some(settled => settled.executionEventId === event.id)).map(event => [event.id, `${event.id} · ${formatPhp(event.amountCentavos!)} · ${event.method}`])}
      payments={data.payments.filter(payment => payment.period).map(payment => ({ id: payment.id, reference: payment.reference, amountCentavos: payment.amountCentavos, periodId: payment.period!.id }))}
      requests={events.filter(event => event.kind === "REQUEST" && !events.some(review => review.requestEventId === event.id)).map(event => ({ id: event.id, reason: event.reason! }))} />
    <section className="mt-8" aria-labelledby="case-trail-title"><h2 id="case-trail-title" className="text-xl font-semibold">Preserved investigation and decision trail</h2>
      <ol className="mt-4 divide-y divide-border">{events.map(event => <li key={event.id} id={`event-${event.id}`} className="min-w-0 py-5">
        <h3 className="font-semibold">{event.revision}. {event.kind} · {event.outcome}</h3><p className="mt-1 text-sm">{data.operators.find(operator => operator.id === event.actorId)?.user.name} · {pht.format(event.createdAt)} PHT</p>
        <p className="mt-2 break-words">{event.reasoning}</p><p className="mt-2 break-all text-sm">Evidence reference: {event.evidenceReference ?? "Uncorroborated claim; no independent evidence provided"}</p>
        {event.independentEvidenceReference && <p className="mt-2 break-all text-sm">Independent corroboration: {event.independentEvidenceReference}</p>}
        {event.kind === "APPROVE_RECOVERY" && data.recoveryCharges.filter(charge => charge.id === event.recoveryChargeId).map(charge => <p className="mt-2 text-sm" key={charge.id}>Approved recovery: {charge.planName}, {formatPhp(charge.priceCentavos)}, {charge.durationDays} days. Period: {pht.format(charge.intendedStart)} to {pht.format(charge.intendedEnd)} PHT. Original collector: {data.operators.find(operator => operator.id === event.recoveryCollectorId)?.user.name}. Awaiting separate execution; no payment recorded by this approval.</p>)}
        {event.kind === "EXECUTE_APPROVED" && <p className="mt-2 text-sm">Executed linked adjustment: {formatPhp(event.amountCentavos!)} · {event.method}. Approved access outcome: {event.accessOutcome}. {event.outcome === "AWAITING_SETTLEMENT" ? "Refund awaiting verified external settlement. The CRM has not transferred money." : "Zero money movement; correction completed."}</p>}
        {event.kind === "SETTLE" && <p className="mt-2 break-all text-sm">External settlement independently verified: {event.settlementReference} · {formatPhp(event.amountCentavos!)} · {event.method} · {pht.format(event.settledAt!)} PHT.</p>}
        {event.paymentId && <p className="mt-2 break-all text-sm">Linked payment: {event.paymentId} {data.payments.find(payment => payment.id === event.paymentId)?.receipt && <Link className="underline" href={`/receipts/${data.payments.find(payment => payment.id === event.paymentId)!.receipt!.id}`}>View original receipt</Link>}. Existing confirmation preserved.</p>}
        {event.kind === "REQUEST" && <dl className="mt-3 grid min-w-0 gap-3 break-words text-sm sm:grid-cols-2">
          <div><dt>Request reference</dt><dd className="break-all">{event.id}</dd></div><div><dt>Classification / actual collections</dt><dd>{event.reason} / {event.collectionCount}</dd></div>
          <div><dt>Proposed money outcome</dt><dd>{event.moneyOutcome} · {formatPhp(event.amountCentavos!)} · {event.method}. No money movement completed.</dd></div>
          <div><dt>Proposed access outcome / effective date</dt><dd>{event.accessOutcome} · {pht.format(event.effectiveAt!)} PHT. No access change executed.</dd></div>
          <div><dt>Affected original period</dt><dd className="break-all">{event.periodId}</dd></div><div><dt>Other payment / retained period</dt><dd className="break-all">{event.relatedPaymentId ?? "None"} / {event.retainedPeriodId ?? "None"}</dd></div>
          {event.adjustedStartsAt && event.adjustedEndsAt && <div><dt>Explicit adjusted interval</dt><dd>{pht.format(event.adjustedStartsAt)} to {pht.format(event.adjustedEndsAt)} PHT</dd></div>}
          <div><dt>Excess-payment evidence conclusions</dt><dd>Same obligation: {event.sameObligation ? "verified" : "unset"}. Unintended collection: {event.unintendedCollection ? "verified" : "unset"}.</dd></div>
        </dl>}
        {event.requestEventId && <p className="mt-3 break-all text-sm">Linked request: <a className="underline" href={`#event-${event.requestEventId}`}>{event.requestEventId}</a>. Owner decision: {event.decision ?? "See approval"}. {event.kind === "REVIEW" && (event.outcome === "APPROVED_BLOCKED" ? "Unsupported execution remains blocked; refund not completed; access preserved." : "Review recorded; execution and verified settlement are separate records.")}</p>}
      </li>)}</ol>
    </section>
  </>;
}

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
      payments={data.payments.filter(payment => payment.period).map(payment => ({ id: payment.id, reference: payment.reference, amountCentavos: payment.amountCentavos, periodId: payment.period!.id }))}
      requests={events.filter(event => event.kind === "REQUEST" && !events.some(review => review.requestEventId === event.id)).map(event => ({ id: event.id, reason: event.reason! }))} />
    <section className="mt-8" aria-labelledby="case-trail-title"><h2 id="case-trail-title" className="text-xl font-semibold">Preserved investigation and decision trail</h2>
      <ol className="mt-4 divide-y divide-border">{events.map(event => <li key={event.id} id={`event-${event.id}`} className="min-w-0 py-5">
        <h3 className="font-semibold">{event.revision}. {event.kind} · {event.outcome}</h3><p className="mt-1 text-sm">{data.operators.find(operator => operator.id === event.actorId)?.user.name} · {pht.format(event.createdAt)} PHT</p>
        <p className="mt-2 break-words">{event.reasoning}</p><p className="mt-2 break-all text-sm">Evidence reference: {event.evidenceReference ?? "Uncorroborated claim; no independent evidence provided"}</p>
        {event.paymentId && <p className="mt-2 break-all text-sm">Linked payment: {event.paymentId} {data.payments.find(payment => payment.id === event.paymentId)?.receipt && <Link className="underline" href={`/receipts/${data.payments.find(payment => payment.id === event.paymentId)!.receipt!.id}`}>View original receipt</Link>}. Existing confirmation preserved.</p>}
        {event.kind === "REQUEST" && <dl className="mt-3 grid min-w-0 gap-3 break-words text-sm sm:grid-cols-2">
          <div><dt>Request reference</dt><dd className="break-all">{event.id}</dd></div><div><dt>Classification / actual collections</dt><dd>{event.reason} / {event.collectionCount}</dd></div>
          <div><dt>Proposed money outcome</dt><dd>{event.moneyOutcome} · {formatPhp(event.amountCentavos!)} · {event.method}. No money movement completed.</dd></div>
          <div><dt>Proposed access outcome / effective date</dt><dd>{event.accessOutcome} · {pht.format(event.effectiveAt!)} PHT. No access change executed.</dd></div>
          <div><dt>Affected original period</dt><dd className="break-all">{event.periodId}</dd></div><div><dt>Other payment / retained period</dt><dd className="break-all">{event.relatedPaymentId ?? "None"} / {event.retainedPeriodId ?? "None"}</dd></div>
        </dl>}
        {event.requestEventId && <p className="mt-3 break-all text-sm">Owner decision: {event.decision} on <a className="underline" href={`#event-${event.requestEventId}`}>request {event.requestEventId}</a>. {event.decision === "APPROVE" && "Approved proposal only. Execution blocked; refund not completed; access preserved."}</p>}
      </li>)}</ol>
    </section>
  </>;
}

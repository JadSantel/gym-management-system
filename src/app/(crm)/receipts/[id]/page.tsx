import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inGym } from "@/lib/tenant";
import { recordParamsSchema } from "@/lib/route-schema";
import { IdentityError } from "@/lib/identity";
export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const rawParams = await params;
  const receipt = await inGym(await headers(), "MEMBERS", async tx => {
    const parsed = recordParamsSchema.safeParse({ id: rawParams.id });
    if (!parsed.success) throw new IdentityError(400, "Invalid record reference.");
    const receipt = await tx.paymentReceipt.findUnique({ where: { id: parsed.data.id }, include: {
      payment: { include: { gym: true, member: true, collector: { select: { user: { select: { name: true } } } }, verifier: { select: { user: { select: { name: true } } } }, charge: true, period: true } },
    } });
    if (!receipt) return null;
    const settlement = await tx.digitalSettlement.findUnique({ where: { paymentId: receipt.paymentId } });
    const claim = settlement ? await tx.digitalClaim.findUnique({ where: { id: settlement.claimId } }) : null;
    const account = claim ? await tx.receivingAccount.findUnique({ where: { id: claim.accountId } }) : null;
    const flags = await tx.paymentFlag.findMany({ where: { paymentId: receipt.paymentId } });
    const adjustments = await tx.investigationEvent.findMany({ where: { paymentId: receipt.paymentId, kind: { in: ["RECOVER", "EXECUTE_APPROVED"] } } });
    const refunds = await tx.investigationEvent.findMany({ where: { kind: "SETTLE", executionEventId: { in: adjustments.map(event => event.id) } } });
    const outageConfirmation = await tx.outageConfirmation.findUnique({ where: { paymentId: receipt.paymentId } });
    const outageEntry = outageConfirmation ? await tx.outageEntry.findUnique({ where: { id: outageConfirmation.entryId } }) : null;
    const outageBook = outageEntry ? await tx.outageBook.findUnique({ where: { id: outageEntry.bookId } }) : null;
    return { ...receipt, settlement, claim, account, flags, adjustments, refunds, outageEntry, outageBook };
  }).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400) notFound(); redirect("/"); } throw error;
  });
  if (!receipt) notFound();
  const { payment } = receipt;
  const period = payment.period;
  if (!period) notFound();
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
  return <><Link href={`/members/${payment.memberId}`} className="text-sm underline">Back to {payment.member.fullName}</Link>
    <article className="mx-auto mt-8 max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8" aria-labelledby="receipt-title">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{payment.gym.name}</p><h1 id="receipt-title" className="mt-2 text-3xl font-semibold">{payment.method === "CASH" ? "Cash payment receipt" : `${receipt.account?.label.replace(/^Enrollment: /, "") ?? payment.method} payment receipt`}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Receipt reference: <span className="break-all font-medium text-foreground">{receipt.reference}</span></p>
      <dl className="mt-7 grid gap-5 border-y border-border py-6 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Member</dt><dd className="font-semibold">{payment.member.fullName}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Amount received</dt><dd className="text-xl font-semibold tabular-nums">₱{(payment.amountCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Payment method</dt><dd>{payment.method}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Plan</dt><dd>{payment.charge.planName} · {payment.charge.durationDays} days</dd></div>
        <div><dt className="text-sm text-muted-foreground">Collected by</dt><dd>{payment.collector.user.name} · {pht.format(payment.collectedAt)} PHT</dd></div>
        <div><dt className="text-sm text-muted-foreground">Recorded at</dt><dd>{pht.format(payment.enteredAt)} PHT</dd></div>
        <div><dt className="text-sm text-muted-foreground">Verified by</dt><dd>{payment.verifier.user.name} · {pht.format(payment.verifiedAt)} PHT</dd></div>
        <div><dt className="text-sm text-muted-foreground">Receipt issued</dt><dd>{pht.format(receipt.issuedAt)} PHT</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Paid period</dt><dd>{pht.format(period.startsAt)} PHT inclusive to {pht.format(period.endsAt)} PHT exclusive</dd></div>
      </dl>
      <p className="text-sm">Payment reference: <span className="break-all font-medium">{payment.reference}</span></p>
      <p className="mt-3 text-sm">Original receipt remains unchanged. <Link className="underline" href={`/members/${payment.memberId}#member-payments`}>View member payment history</Link>.</p>
      {receipt.outageEntry && <p className="mt-3 break-words text-sm">Historical paper receipt {receipt.outageBook?.code}-{receipt.outageEntry.number}. Issued {pht.format(receipt.outageEntry.issuedAt)} PHT; later entry and verification links remain preserved. {receipt.outageEntry.visitAt ? `Historical visit recorded ${pht.format(receipt.outageEntry.visitAt)} PHT, reference ${receipt.outageEntry.visitReference}. It does not grant current access.` : "No historical visit is recorded."}</p>}
      {receipt.claim && <p className="mt-3 break-all text-sm">{receipt.account?.label.startsWith("Enrollment: ") ? "Online transfer reference" : "Historical digital transfer reference"}: {receipt.claim.transactionReference}. Matched receiving provider/account: {receipt.account?.label.replace(/^Enrollment: /, "")}. Evidence reference retained read-only: {receipt.settlement?.evidenceReference}.</p>}
      {receipt.flags.map(flag => <p key={flag.id} className="mt-3 text-sm">Historical review flag retained read-only: {flag.reason}.</p>)}
      {receipt.adjustments.map(event => <p key={event.id} className="mt-3 break-words text-sm"><strong>{event.kind === "RECOVER" ? "Historical recovered collection" : "Historical linked adjustment"}</strong>: {receipt.refunds.some(refund => refund.executionEventId === event.id) ? "external refund settlement recorded" : event.outcome}.
        {event.accessOutcome && <> Recorded access outcome: {event.accessOutcome}{event.effectiveAt ? `, effective ${pht.format(event.effectiveAt)} PHT` : ""}.</>} This original receipt and period remain preserved. The historical event is read-only.</p>)}
    </article></>;
}

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { memberQuerySchema, recordParamsSchema } from "@/lib/route-schema";
import { IdentityError } from "@/lib/identity";
import { ChargePreview } from "@/components/charge-preview";
import { MemberPaymentDialog } from "@/components/member-payment-dialog";
import { MemberQr } from "@/components/member-qr";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assessEligibility, remainingActiveTime } from "@/lib/eligibility";
import { membershipProgress } from "@/lib/membership-progress";
import { memberQr } from "@/lib/attendance";
import { formatPhp } from "@/lib/money";
import { manilaMonthRange } from "@/lib/attendance-schema";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";
export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ charge?: string | string[] }> }) {
  const rawParams = await params, rawQuery = await searchParams;
  const checkedAt = new Date(), monthRange = manilaMonthRange(checkedAt), requestHeaders = await headers();
  const data = await inGym(requestHeaders, "MEMBERS", async (tx, actor) => {
    const parsed = recordParamsSchema.safeParse({ id: rawParams.id }), query = memberQuerySchema.safeParse({ charge: rawQuery.charge });
    if (!parsed.success || !query.success) throw new IdentityError(400, "Invalid record reference.");
    const member = await tx.member.findUnique({ where: { id: parsed.data.id } });
    if (!member) return null;
    const plans = await tx.plan.findMany({ orderBy: { durationDays: "asc" } });
    const payments = await tx.payment.findMany({ where: { memberId: member.id }, orderBy: [{ enteredAt: "desc" }, { id: "desc" }], include: { receipt: true } });
    const intervals = await tx.effectiveEntitlement.findMany({ where: { memberId: member.id, isCurrentProjection: true }, orderBy: { startsAt: "asc" } });
    const visitsThisMonth = await tx.attendanceVisit.count({ where: { memberId: member.id, voided: false, arrivedAt: { gte: monthRange.start, lt: monthRange.end, lte: checkedAt } } });
    const charge = query.data.charge ? await tx.charge.findFirst({ where: { id: query.data.charge, memberId: member.id }, include: { plan: { select: { version: true } }, preparer: { select: { user: { select: { name: true } } } } } }) : null;
    if (query.data.charge && !charge) throw new IdentityError(404, "Charge preview unavailable.");
    return { member, plans, charge, payments, intervals, visitsThisMonth, recoveryScope: `${actor.operator.gymId}:${actor.operator.id}`, canPrepare: actor.operator.role === "OWNER" || actor.operator.canCollectCash };
  }).catch(error => { if (error instanceof IdentityError) { if (error.status === 400 || error.status === 404) notFound(); redirect("/"); } throw error; });
  if (!data) notFound();
  const { member, plans, charge, payments, intervals, visitsThisMonth } = data;
  const qr = await memberQr(requestHeaders, member.id), eligibility = assessEligibility(intervals, checkedAt);
  const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
  const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
  const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", timeStyle: "short", hourCycle: "h23" });
  const queued = intervals.some(interval => interval.startsAt > checkedAt);
  const status = eligibility.status === "ELIGIBLE" ? "Eligible" : eligibility.status === "SCHEDULED" ? "Not eligible yet" : eligibility.status === "EXPIRED" ? "Expired" : "Not eligible";
  const statusClass = eligibility.status === "ELIGIBLE" ? "bg-success-surface text-success" : eligibility.status === "SCHEDULED" ? "bg-attention-surface text-attention" : "bg-destructive/10 text-destructive";
  const progress = eligibility.interval ? membershipProgress(eligibility.interval, checkedAt) : null;
  return <>
    <div className="page-heading"><div><Link href="/members" className="text-link">Back to members</Link><h1 className="mt-3">Member profile</h1><p>Membership, billing and personal QR.</p></div></div>
    <Card className="mb-4 gap-0 rounded-lg">
      <CardHeader className="flex items-center gap-3 border-b border-border pb-5"><span className="initial-avatar" aria-hidden="true">{member.fullName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight">{member.fullName}</h2><p className="mt-1 break-all text-xs text-muted-foreground">Member reference: {member.id}</p></div></CardHeader>
      <CardContent id="member-summary" role="region" className="pt-5" aria-labelledby="member-summary-title"><h3 id="member-summary-title" className="mb-4 font-semibold">Member details</h3><dl className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Phone</dt><dd className="mt-1 break-all font-medium">{member.phone || "Not recorded"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{member.email || "Not recorded"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Membership status</dt><dd className="mt-1"><Badge className={statusClass}>{status}</Badge></dd></div>
        <div><dt className="text-xs text-muted-foreground">Visits this month</dt><dd className="mt-1 font-semibold tabular-nums">{visitsThisMonth}<span className="mt-1 block text-xs font-normal text-muted-foreground">Recorded visits, excluding voided entries.</span></dd></div>
      </dl></CardContent>
    </Card>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
      <Card role="region" className="min-w-0 gap-0 rounded-lg" aria-labelledby="billing-title">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-5"><div className="flex items-baseline gap-3"><h2 id="billing-title" className="panel-title">Billing</h2><span className="text-xs text-muted-foreground">{payments.length} {payments.length === 1 ? "payment" : "payments"}</span></div>
          <MemberPaymentDialog initialOpen={!!charge}><ChargePreview key={`${member.id}:${charge?.id ?? "no-preview"}`} memberId={member.id} memberName={member.fullName} canPrepare={data.canPrepare} saleBlocked={queued} recoveryScope={data.recoveryScope} accessStatus={status} accessReason={eligibility.reason}
            plans={plans.map(({ id, name, durationDays, priceCentavos, version }) => ({ id, name, durationDays, priceCentavos, version }))}
            saved={charge ? { id: charge.id, planId: charge.planId, planName: charge.planName, durationDays: charge.durationDays, priceCentavos: charge.priceCentavos, intendedStart: charge.intendedStart.toISOString(), intendedEnd: charge.intendedEnd.toISOString(), preparedAt: charge.preparedAt.toISOString(), preparerName: charge.preparer.user.name, priceChanged: charge.planVersion !== charge.plan.version } : null} />
          </MemberPaymentDialog>
        </CardHeader>
        <CardContent className="min-w-0">
          <section id="member-overview" aria-labelledby="membership-access-title" className="scroll-mt-6 border-t border-border py-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="membership-access-title" className="font-semibold">Membership access</h3><Badge className={statusClass}>{status}</Badge></div>
            {eligibility.interval && progress ? <>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-muted-foreground">{eligibility.status === "SCHEDULED" ? "Starts (scheduled)" : "Started"} · inclusive</dt><dd className="mt-1 font-medium"><time dateTime={eligibility.interval.startsAt.toISOString()}>{pht.format(eligibility.interval.startsAt)} PHT</time></dd></div><div><dt className="text-xs text-muted-foreground">Expiry · exclusive</dt><dd className="mt-1 font-medium"><time dateTime={eligibility.interval.endsAt.toISOString()}>{pht.format(eligibility.interval.endsAt)} PHT</time></dd></div></dl>
              <div role="progressbar" aria-label="Membership time used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.percent)} aria-valuetext={`${progress.usedDays} whole days used${eligibility.status === "SCHEDULED" ? "; membership has not started" : `; ${progress.daysLeft} whole days left`}`} className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} /></div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{progress.usedDays} {progress.usedDays === 1 ? "day" : "days"} used</span><span>{eligibility.status === "SCHEDULED" ? "Not started" : `${progress.daysLeft} ${progress.daysLeft === 1 ? "day" : "days"} left`}</span></div>
              {eligibility.status === "ELIGIBLE" && <p className="mt-3 text-xs text-muted-foreground">Remaining: {remainingActiveTime(eligibility.interval, checkedAt)}. Whole days and hours, rounded down.</p>}
            </> : <p className="mt-3 text-sm text-muted-foreground">No verified membership recorded. Record a full received payment to activate membership.</p>}
            <p className="mt-3 text-sm text-muted-foreground">{eligibility.reason}</p>
            {eligibility.status !== "SCHEDULED" && intervals.filter(interval => interval.startsAt > checkedAt).map(interval => <p key={interval.id} className="mt-3 text-sm text-attention">Paid next term: {pht.format(interval.startsAt)} PHT to {pht.format(interval.endsAt)} PHT (end exclusive). Access begins at its start.</p>)}
            {queued && <p id="renewal-blocked" className="mt-3 text-xs text-attention">Another advance sale is blocked until the scheduled paid period starts. Original payment confirmation can still be resolved.</p>}
            <p className="mt-3 text-xs text-muted-foreground">Checked <time dateTime={checkedAt.toISOString()}>{pht.format(checkedAt)} PHT</time>. Previews and unverified payments grant no access.</p>
          </section>
          <section id="member-payments" aria-labelledby="payment-history-title" className={`scroll-mt-6 border-t border-border pt-5 ${styles.history}`}>
            <h3 id="payment-history-title" className="mb-3 font-semibold">Payment history</h3>
            <Table className={styles.table}><caption className="sr-only">Confirmed payment entries. Dates are recorded in Philippine time.</caption>
              <TableHeader><TableRow><TableHead scope="col">Entry recorded</TableHead><TableHead scope="col">Amount</TableHead><TableHead scope="col">Receipt</TableHead><TableHead scope="col" className="text-right">Status</TableHead></TableRow></TableHeader>
              <TableBody>{payments.length ? payments.map(payment => <TableRow key={payment.id}>
                <TableCell data-label="Entry recorded"><time dateTime={payment.enteredAt.toISOString()} className="block">{date.format(payment.enteredAt)}<span className="mt-1 block text-xs text-muted-foreground">{time.format(payment.enteredAt)} PHT</span></time></TableCell>
                <TableCell data-label="Amount" className="font-medium tabular-nums">{formatPhp(payment.amountCentavos)}</TableCell>
                <TableCell data-label="Receipt">{payment.receipt ? <Link href={`/receipts/${payment.receipt.id}`} aria-label={`View receipt ${payment.receipt.reference}`} className="text-link inline-flex min-h-11 items-center">View receipt</Link> : <span className="text-muted-foreground">Unavailable</span>}</TableCell>
                <TableCell data-label="Status" className="text-right"><Badge className="bg-success-surface text-success">Confirmed</Badge></TableCell>
              </TableRow>) : <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No confirmed payments recorded.</TableCell></TableRow>}</TableBody>
            </Table>
          </section>
        </CardContent>
      </Card>
      <MemberQr key={qr?.code ?? "no-qr"} memberId={member.id} initial={qr} />
    </div>
  </>;
}

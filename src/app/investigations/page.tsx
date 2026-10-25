import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { paymentHistory } from "@/lib/investigations";
import { historyQuerySchema, caseReasons, investigationGates } from "@/lib/investigation-schema";
import { IdentityError } from "@/lib/identity";
import { InvestigationActions } from "@/components/investigation-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/money";
export const dynamic = "force-dynamic";
const selectStyle = "min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2";
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams; const parsed = historyQuerySchema.safeParse(raw); const query = parsed.success ? parsed.data : {};
  const data = await paymentHistory(await headers(), query).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <><Link href="/" className="underline">Back to home</Link><h1 className="mt-5 text-3xl font-semibold">Payment investigations</h1>
    <p className="mt-3 text-sm text-muted-foreground">Search confirmed collections, document claims and route corrections to owner review. Claims and review approvals grant no new access.</p>
    {!parsed.success && <p role="alert" className="mt-4">Invalid filters were not applied. Enter a valid date or record reference.</p>}
    <section className="mt-7" aria-labelledby="history-search-title"><h2 id="history-search-title" className="text-xl font-semibold">Search payment history</h2>
      <form method="get" className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label>Member name<Input name="member" defaultValue={query.member} maxLength={100} /></label>
        <label>Member reference<Input name="memberId" defaultValue={query.memberId} maxLength={36} /></label>
        <label>Transaction or receipt reference<Input name="reference" defaultValue={query.reference} maxLength={100} /></label>
        <label>Collection date (PHT)<Input name="date" type="date" defaultValue={query.date} /></label>
        <label>Payment method<select className={selectStyle} name="method" defaultValue={query.method}><option value="">All methods</option><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK">Bank</option></select></label>
        <label>Collector<select className={selectStyle} name="collectorId" defaultValue={query.collectorId}><option value="">All collectors</option>{data.operators.map(operator => <option key={operator.id} value={operator.id}>{operator.user.name}</option>)}</select></label>
        <Button type="submit">Search confirmed payments</Button>
      </form>
      <p className="mt-4 text-sm">{data.payments.length} confirmed payment(s). {data.morePayments && "First 50 shown. Narrow the filters to find older collections."}</p>
      <ol className="mt-3 divide-y divide-border">{data.payments.map(payment => <li key={payment.id} className="min-w-0 py-4">
        <Link href={`/members/${payment.memberId}`} className="font-semibold underline">{payment.member.fullName}</Link><p>{formatPhp(payment.amountCentavos)} · {payment.method} · {payment.collector.user.name} · {pht.format(payment.collectedAt)} PHT</p>
        <p className="break-all text-sm">Payment: {payment.reference}</p>{payment.receipt && <Link className="break-all text-sm underline" href={`/receipts/${payment.receipt.id}`}>Receipt: {payment.receipt.reference}</Link>}
        <p className="mt-2"><Link className="text-sm underline" href={`/investigations?memberId=${payment.memberId}`}>Investigate this member</Link></p>
      </li>)}</ol>
    </section>
    <section className="mt-7" aria-labelledby="case-list-title"><h2 id="case-list-title" className="text-xl font-semibold">Investigation cases{data.member ? ` · ${data.member.fullName}` : ""}</h2>
      <p className="mt-2 text-sm">Cases filter by member reference; payment filters apply to confirmed history above. {data.moreCases && "First 50 cases shown; use the member reference filter or a saved case link."}</p>
      {data.cases.length ? <ol className="mt-3 divide-y divide-border">{data.cases.map(record => <li key={record.id} className="py-4"><Link className="break-all font-semibold underline" href={`/investigations/${record.id}`}>{caseReasons[record.reason as keyof typeof caseReasons]} · {record.id}</Link><p className="mt-1 break-words">{record.summary}</p><p className="mt-1 text-sm">{record.latest.outcome} · {pht.format(record.openedAt)} PHT</p></li>)}</ol> : <p className="mt-3 text-sm">No cases recorded for this view.</p>}
    </section>
    <InvestigationActions key={query.memberId ?? "all"} memberId={query.memberId || undefined} recoveryScope={data.recoveryScope} />
    <aside className="mt-6 space-y-3 text-sm" aria-label="Policy gates"><p>{investigationGates.recovery}</p><p>{investigationGates.execution}</p></aside>
  </>;
}

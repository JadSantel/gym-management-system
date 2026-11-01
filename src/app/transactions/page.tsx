import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { paymentHistory } from "@/lib/payment-history";
import { IdentityError } from "@/lib/identity";
import { TransactionList, type TransactionRow } from "@/components/transaction-list";
import { WorkspaceIcon } from "@/components/workspace-icon";
export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? "";
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const requestHeaders = await headers();
  const filters = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, one(value)]));
  const data = await paymentHistory(requestHeaders, filters).catch(error => { if (error instanceof IdentityError) { if (error.status === 400) redirect("/transactions"); redirect("/team"); } throw error; });
  const rows: TransactionRow[] = data.payments.map(payment => ({ id: payment.id, reference: payment.reference, memberId: payment.memberId, member: payment.member.fullName, method: payment.method === "BANK" ? "Bank transfer (historical)" : payment.method === "GCASH" ? "GCash (historical)" : "Cash", amount: payment.amountCentavos, at: payment.collectedAt.toISOString(), href: payment.receipt ? `/receipts/${payment.receipt.id}` : `/members/${payment.memberId}` }));
  return <><div className="page-heading"><div><h1>Payment history</h1><p>Search confirmed collections, receipts, methods, collectors, and member links.</p></div><Link href="/operate" className="action-link"><WorkspaceIcon name="plus" />Record cash payment</Link></div>
    <form method="get" role="search" aria-label="Search payment history" className="panel mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-sm">Member name<input name="member" defaultValue={one(filters.member)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2" /></label>
      <label className="text-sm">Reference<input name="reference" defaultValue={one(filters.reference)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2" /></label>
      <label className="text-sm">Collection date<input name="date" type="date" defaultValue={one(filters.date)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2" /></label>
      <label className="text-sm">Original method<select name="method" defaultValue={one(filters.method)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2"><option value="">All methods</option><option value="CASH">Cash</option><option value="GCASH">GCash (historical)</option><option value="BANK">Bank transfer (historical)</option></select></label>
      <label className="text-sm">Collector<select name="collectorId" defaultValue={one(filters.collectorId)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 py-2"><option value="">All collectors</option>{data.operators.map(operator => <option key={operator.id} value={operator.id}>{operator.user.name}</option>)}</select></label>
      <div className="flex items-end gap-3 xl:col-span-5"><button type="submit" className="action-link">Search history</button><Link href="/transactions" className="text-link">Clear</Link></div>
    </form>
    <p className="mb-3 text-xs text-muted-foreground">Showing up to 50 matching confirmed payments{data.morePayments ? "; narrow the search to see older records" : ""}. Earlier digital payments remain identified by their original method. Digital collections, Exceptions, outage receipt/custody, and daily closing workflows are retired; historical records are read-only.</p>
    <TransactionList rows={rows} /><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Ordinary collection accepts full cash only. Existing payment, receipt, investigation, correction/refund, outage, and closing records are retained and are not changed by this history view.</p>
  </>;
}

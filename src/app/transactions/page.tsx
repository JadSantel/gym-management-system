import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { paymentHistory } from "@/lib/investigations";
import { digitalOverview } from "@/lib/digital";
import { IdentityError } from "@/lib/identity";
import { TransactionList, type TransactionRow } from "@/components/transaction-list";
import { WorkspaceIcon } from "@/components/workspace-icon";
export const dynamic = "force-dynamic";
export default async function TransactionsPage() {
  const requestHeaders = await headers();
  const data = await paymentHistory(requestHeaders, {}).catch(error => { if (error instanceof IdentityError) redirect("/team"); throw error; });
  const digital = await digitalOverview(requestHeaders);
  const rows: TransactionRow[] = data.payments.map(payment => ({ id: payment.id, reference: payment.reference, memberId: payment.memberId, member: payment.member.fullName, method: payment.method === "BANK" ? "Bank transfer" : payment.method === "GCASH" ? "GCash" : "Cash", amount: payment.amountCentavos, at: payment.collectedAt.toISOString(), status: "Confirmed", href: payment.receipt ? `/receipts/${payment.receipt.id}` : `/members/${payment.memberId}` }));
  for (const claim of digital.claims.filter(row => !digital.settlements.some(settlement => settlement.claimId === row.id))) {
    const charge = digital.charges.find(row => row.id === claim.chargeId)!;
    rows.push({ id: claim.id, reference: claim.transactionReference, memberId: charge.member.id, member: charge.member.fullName, method: digital.accounts.find(row => row.id === claim.accountId)?.method === "BANK" ? "Bank transfer" : "GCash", amount: claim.amountCentavos, at: claim.enteredAt.toISOString(), status: "Pending verification", href: `/digital#claim-${claim.id}` });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return <><div className="page-heading"><div><h1>Transactions</h1><p>A traceable record of collections, verification, and pending payments.</p></div><Link href="/operate" className="action-link"><WorkspaceIcon name="plus" />Record membership</Link></div>
    <div className="mb-4 flex flex-wrap gap-2"><span className="rounded-md border border-border bg-card px-3 py-2 text-xs"><strong>{data.payments.length}{data.morePayments ? "+" : ""}</strong> confirmed records in this view</span><span className="rounded-md border border-border bg-card px-3 py-2 text-xs"><strong>{rows.filter(row => row.status === "Pending verification").length}</strong> pending verification</span><Link href="/investigations" className="text-link self-center px-2">Search full payment history</Link></div>
    <TransactionList rows={rows} /><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Original confirmed transactions remain immutable. Corrections and refunds use linked owner-approved cases. Pending claims grant no new paid access.</p>
  </>;
}

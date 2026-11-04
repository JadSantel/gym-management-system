import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { paymentHistory } from "@/lib/payment-history";
import { IdentityError } from "@/lib/identity";
import { TransactionList, type TransactionRow } from "@/components/transaction-list";

export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const data = await paymentHistory(await headers(), filters).catch(error => {
    if (error instanceof IdentityError) redirect(error.status === 400 ? "/transactions" : "/team");
    throw error;
  });
  const rows: TransactionRow[] = data.payments.map(payment => ({
    id: payment.id, reference: payment.reference, memberId: payment.memberId, member: payment.member.fullName,
    method: payment.method, amount: payment.amountCentavos, at: payment.collectedAt.toISOString(),
    collector: payment.collector.user.name, plan: `${payment.charge.planName} · ${payment.charge.durationDays} days`,
    receipt: payment.receipt ? { reference: payment.receipt.reference, href: `/receipts/${payment.receipt.id}` } : null,
    period: payment.period ? { from: payment.period.startsAt.toISOString(), to: payment.period.endsAt.toISOString() } : null,
  }));
  return <TransactionList rows={rows} summary={data.summary} filters={data.query} operators={data.operators} pagination={data.pagination} canCollect={data.canCollect} today={new Date(data.checkedAt.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)} />;
}

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
    return tx.paymentReceipt.findUnique({ where: { id: parsed.data.id }, include: {
      payment: { include: { gym: true, member: true, collector: { select: { user: { select: { name: true } } } }, verifier: { select: { user: { select: { name: true } } } }, charge: true, period: true } },
    } });
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
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{payment.gym.name}</p><h1 id="receipt-title" className="mt-2 text-3xl font-semibold">Cash payment receipt</h1>
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
    </article></>;
}

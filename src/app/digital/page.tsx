import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { digitalOverview } from "@/lib/digital";
import { IdentityError } from "@/lib/identity";
import { DigitalPayments } from "@/components/digital-payments";
export const dynamic = "force-dynamic";
export default async function DigitalPage() {
  const data = await digitalOverview(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  return <><Link href="/" className="underline">Back to home</Link><h1 className="mt-5 text-3xl font-semibold">Digital collections</h1>
    <DigitalPayments data={{ accounts: data.accounts, operators: data.operators.map(operator => ({ id: operator.id, name: operator.user.name })),
      claims: data.claims.map(claim => { const charge = data.charges.find(row => row.id === claim.chargeId)!; return {
        id: claim.id, accountId: claim.accountId, amountCentavos: claim.amountCentavos, transactionReference: claim.transactionReference,
        reportedReceivedAt: claim.reportedReceivedAt.toISOString(), enteredAt: claim.enteredAt.toISOString(), collector: data.operators.find(operator => operator.id === claim.collectedBy)?.user.name ?? "Former operator",
        memberId: charge.member.id, memberName: charge.member.fullName, requiredCentavos: charge.priceCentavos, startsAt: charge.intendedStart.toISOString(), endsAt: charge.intendedEnd.toISOString() }; }),
      grants: data.verifiers, settlements: data.settlements.map(row => ({ ...row, receiptId: data.receipts.find(receipt => receipt.paymentId === row.paymentId)!.id })),
      flags: data.flags, owner: data.owner, operatorId: data.operatorId, recoveryScope: data.recoveryScope }} />
  </>;
}

import Link from "next/link";
import { formatPhp } from "@/lib/money";
type Record = { id: string; reference: string; memberId: string; member: { fullName: string }; method: string; amountCentavos: number; collectedAt: Date; receipt: { id: string } | null };
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
export function PaymentRecords({ payments }: { payments: Record[] }) {
  return payments.length ? <table className="record-table"><caption className="sr-only">Confirmed membership collections</caption><thead><tr>{["Reference", "Member", "Method", "Amount", "Status", "Receipt"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{payments.map(payment => <tr key={payment.id}>
    <td data-label="Reference"><div className="min-w-0"><strong className="break-all font-semibold">{payment.reference}</strong><time className="mt-1 block text-xs text-muted-foreground" dateTime={payment.collectedAt.toISOString()}>{pht.format(payment.collectedAt)} PHT</time></div></td>
    <td data-label="Member"><Link className="font-medium hover:underline" href={`/members/${payment.memberId}`}>{payment.member.fullName}</Link></td>
    <td data-label="Method">{payment.method === "BANK" ? "Bank transfer" : payment.method === "GCASH" ? "GCash" : "Cash"}</td>
    <td data-label="Amount" className="font-semibold tabular-nums">{formatPhp(payment.amountCentavos)}</td>
    <td data-label="Status"><span className="status-label success">Confirmed</span></td>
    <td data-label="Receipt">{payment.receipt ? <Link className="text-link" href={`/receipts/${payment.receipt.id}`}>View receipt<span className="sr-only"> {payment.reference}</span></Link> : <span className="text-muted-foreground">Unavailable</span>}</td>
  </tr>)}</tbody></table> : <p className="py-10 text-center text-sm text-muted-foreground">No confirmed payments recorded.</p>;
}

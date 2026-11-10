import Link from "next/link";
import { formatPhp } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
type Record = { id: string; reference: string; memberId: string; member: { fullName: string }; method: string; amountCentavos: number; collectedAt: Date; receipt: { id: string } | null };
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
export function PaymentRecords({ payments }: { payments: Record[] }) {
  return payments.length ? <Table className="record-table"><caption className="sr-only">Confirmed membership collections</caption><TableHeader><TableRow>{["Member", "Amount", "Method", "Collected (PHT)", "Receipt"].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{payments.map(payment => <TableRow key={payment.id}>
    <TableCell data-label="Member"><Link className="font-medium hover:underline" href={`/members/${payment.memberId}`}>{payment.member.fullName}</Link></TableCell>
    <TableCell data-label="Amount" className="font-semibold tabular-nums">{formatPhp(payment.amountCentavos)}</TableCell>
    <TableCell data-label="Method">{payment.method === "CASH" ? "Cash" : payment.method === "GCASH" ? "Online · GCash" : "Online · Bank transfer"}</TableCell>
    <TableCell data-label="Collected (PHT)"><time className="text-xs text-muted-foreground" dateTime={payment.collectedAt.toISOString()}>{pht.format(payment.collectedAt)}</time></TableCell>
    <TableCell data-label="Receipt">{payment.receipt ? <Link className="text-link inline-flex min-h-11 items-center" href={`/receipts/${payment.receipt.id}`}>View receipt<span className="sr-only"> {payment.reference}</span></Link> : <span className="text-muted-foreground">Unavailable</span>}</TableCell>
  </TableRow>)}</TableBody></Table> : <p className="py-8 text-center text-sm text-muted-foreground">No confirmed payments recorded. Find a member to record their first full payment.</p>;
}

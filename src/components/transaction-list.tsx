"use client";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { formatPhp } from "@/lib/money";
export type TransactionRow = { id: string; reference: string; memberId: string; member: string; method: string; amount: number; at: string; href: string };
export function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const [query, setQuery] = useState("");
  const visible = rows.filter(row => `${row.reference} ${row.member}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="panel" aria-label="Payment history"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><label className="min-w-0 grow basis-64 sm:max-w-sm" htmlFor="transaction-search">Filter visible records<Input id="transaction-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Reference or member name" /></label></div>
    <p role="status" className="mb-3 text-xs text-muted-foreground">{visible.length} payment record(s) shown. Historical records keep their original method and receipt links.</p>
    {visible.length ? <table className="record-table"><caption className="sr-only">Membership payment history</caption><thead><tr>{["Reference", "Member", "Method", "Amount", "Status", "Receipt"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id}>
      <td data-label="Reference"><div className="min-w-0"><strong className="break-all font-semibold">{row.reference}</strong><time dateTime={row.at} className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.at))} PHT</time></div></td>
      <td data-label="Member"><Link className="font-medium hover:underline" href={`/members/${row.memberId}`}>{row.member}</Link></td><td data-label="Method">{row.method}</td><td data-label="Amount" className="font-semibold tabular-nums">{formatPhp(row.amount)}</td><td data-label="Status"><span className="status-label success">Confirmed</span></td><td data-label="Receipt"><Link href={row.href} className="text-link">View receipt<span className="sr-only"> {row.reference}</span></Link></td>
    </tr>)}</tbody></table> : <p className="py-12 text-center text-muted-foreground">No transactions match this view. Try another name, reference, or status.</p>}
  </section>;
}

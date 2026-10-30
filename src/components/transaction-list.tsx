"use client";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/money";
export type TransactionRow = { id: string; reference: string; memberId: string; member: string; method: string; amount: number; at: string; status: "Confirmed" | "Pending verification"; href: string };
export function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const visible = rows.filter(row => (filter === "All" || row.status === filter) && `${row.reference} ${row.member}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="panel" aria-label="Transaction records"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><label className="min-w-0 grow basis-64 sm:max-w-sm" htmlFor="transaction-search">Search records<Input id="transaction-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Reference or member name" /></label><div className="flex flex-wrap gap-1" role="group" aria-label="Transaction status">{["All", "Confirmed", "Pending verification"].map(label => <Button key={label} variant="outline" aria-pressed={filter === label} className={filter === label ? "border-foreground bg-muted" : "border-transparent bg-transparent text-muted-foreground"} onClick={() => setFilter(label)}>{label}</Button>)}</div></div>
    <p role="status" className="mb-3 text-xs text-muted-foreground">{visible.length} record(s) shown. Confirmed history includes the latest 50 payments; pending claims are listed separately from confirmed funds.</p>
    {visible.length ? <table className="record-table"><caption className="sr-only">Collections and unverified claims</caption><thead><tr>{["Reference", "Member", "Method", "Amount", "Status", "Details"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id}>
      <td data-label="Reference"><div className="min-w-0"><strong className="break-all font-semibold">{row.reference}</strong><time dateTime={row.at} className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.at))} PHT</time></div></td>
      <td data-label="Member"><Link className="font-medium hover:underline" href={`/members/${row.memberId}`}>{row.member}</Link></td><td data-label="Method">{row.method}</td><td data-label="Amount" className="font-semibold tabular-nums">{formatPhp(row.amount)}</td><td data-label="Status"><span className={`status-label ${row.status === "Confirmed" ? "success" : "attention"}`}>{row.status}</span></td><td data-label="Details"><Link href={row.href} className="text-link">{row.status === "Confirmed" ? "View receipt" : "Review claim"}<span className="sr-only"> {row.reference}</span></Link></td>
    </tr>)}</tbody></table> : <p className="py-12 text-center text-muted-foreground">No transactions match this view. Try another name, reference, or status.</p>}
  </section>;
}

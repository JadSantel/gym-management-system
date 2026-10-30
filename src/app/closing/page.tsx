import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { closingOverview, previousClosingDay, type ClosingItem } from "@/lib/closing";
import { closingDaySchema } from "@/lib/closing-schema";
import { IdentityError } from "@/lib/identity";
import { ClosingActions } from "@/components/closing-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/money";
export const dynamic = "force-dynamic";

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ day?: string | string[] }> }) {
  const query = await searchParams;
  const day = closingDaySchema.safeParse(query.day ?? previousClosingDay());
  if (!day.success) return <><Link href="/closing" className="underline">Choose a valid closing date</Link><h1 className="mt-5 text-3xl font-semibold">Invalid business date</h1><p>Use one YYYY-MM-DD date.</p></>;
  const data = await closingOverview(await headers(),day.data).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  const operator = (id: string) => data.operators.find(o => o.id === id)?.user.name ?? "Preserved operator reference";
  const pht = (at: Date | string) => new Intl.DateTimeFormat("en-PH", {timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"medium",hourCycle:"h23"}).format(new Date(at))+" PHT";
  const latest = data.snapshots.at(-1);
  const checks = new Map<string,typeof data.checks[number]>();
  for (const c of data.checks.filter(c => c.sourceHash === data.sourceHash)) checks.set(`${c.collectorId}:${c.method}:${c.accountId ?? "CASH"}`,c);
  const items = (list: ClosingItem[]) => list.length ? <ul className="mt-3 space-y-2">{list.map((item,i) => <li key={`${item.kind}:${item.reference}:${i}`} className="break-words"><Link href={item.href} className="underline">{item.kind}</Link>: {item.detail} <span className="text-sm text-muted-foreground">({item.reference})</span></li>)}</ul> : <p className="mt-2">No outstanding items in this source set. Physical completeness still requires independent evidence.</p>;
  const totals = (row: {recorded:number;excluded:number;refunds:number;grossActual?:number;difference?:number}) => <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
    <dt>Original recorded gross</dt><dd>{formatPhp(row.recorded)}</dd><dt>Executed false-record exclusions</dt><dd>{formatPhp(row.excluded)}</dd>
    <dt>Adjusted recorded gross</dt><dd>{formatPhp(row.recorded-row.excluded)}</dd><dt>Evidenced settled refunds</dt><dd>{formatPhp(row.refunds)}</dd>
    <dt>Expected net (allocated)</dt><dd>{formatPhp(row.recorded-row.excluded-row.refunds)}</dd>
    {row.grossActual !== undefined && <><dt>Independent gross actual</dt><dd>{formatPhp(row.grossActual)}</dd><dt>Actual net (allocated)</dt><dd>{formatPhp(row.grossActual-row.refunds)}</dd><dt>{row.difference! < 0 ? "Unresolved shortage" : row.difference! > 0 ? "Unresolved excess" : "Difference"}</dt><dd className="font-semibold">{formatPhp(row.difference!)}</dd></>}
  </dl>;
  const refunds = (list: typeof data.refundMovements) => list.length ? <ul className="mt-3 space-y-3">{list.map(refund => <li key={refund.id} className="break-words">
    <Link href={`/investigations/${refund.caseId}`} className="underline">Refund settlement {refund.settlementReference}</Link>: {formatPhp(refund.amountCentavos)} actually paid by {refund.actualMethod}, settled by {operator(refund.settledBy)} at {pht(refund.settledAt)}; entered {pht(refund.enteredAt)}.
    <br />Net reporting allocated to {operator(refund.collectorId)} / {refund.originalMethod}; original collection {pht(refund.collectedAt)}. This allocation does not change the actual payout method.
  </li>)}</ul> : <p className="mt-2">No evidenced refund settlements in this business day.</p>;
  return <><div className="page-heading"><div><h1>Daily closing</h1><p>Close a business day. Compare confirmed records with independent actual counts.</p></div><Link href="/transactions" className="action-link secondary">View transactions</Link></div>
    <p className="mt-3">Asia/Manila, midnight inclusive to next midnight exclusive. Local synthetic SOP only. Pending funds are not confirmed collections.</p>
    <form className="mt-5 flex flex-wrap items-end gap-3" method="get"><div><label htmlFor="closing-day" className="mb-1 block text-sm font-medium">Business date (Asia/Manila)</label><Input id="closing-day" name="day" type="date" defaultValue={day.data} required /></div><Button type="submit">Review business day</Button></form>
    <section className="panel mt-4" aria-labelledby="closing-preview-title"><h2 id="closing-preview-title" className="panel-title">Current source {data.ended ? "review" : "preview — day still open"}</h2><p className="mt-2 text-sm">{pht(data.start)} inclusive to {pht(data.end)} exclusive. Refunds belong to their settlement day and original collector/method; the settling owner is recorded separately.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{data.rows.map(row => <article className="rounded-xl border border-border bg-card p-5" key={`${row.collectorId}:${row.method}`}><h3 className="font-semibold">{operator(row.collectorId)} · {row.method}</h3>{totals(row)}</article>)}</div>
      {!data.rows.length && <p className="mt-3">No confirmed collections or settled refunds for this date. An explicit actual count can still expose an unrecorded collection.</p>}
    </section>
    <section className="panel mt-4" aria-labelledby="closing-open-title"><h2 id="closing-open-title" className="panel-title">Outstanding items — approval does not clear them</h2>{items(data.items)}</section>
    <section className="panel mt-4" aria-labelledby="closing-refunds-title"><h2 id="closing-refunds-title" className="panel-title">Actual refund settlements and original allocation</h2>{refunds(data.refundMovements)}</section>
    <ClosingActions day={day.data} sourceHash={data.sourceHash} owner={data.owner} canPrepare={data.canPrepare} ended={data.ended} recoveryScope={data.recoveryScope}
      previousId={latest?.id ?? null} checkIds={[...checks.values()].map(c => c.id)} operators={data.operators.map(o => ({id:o.id,name:o.user.name}))}
      investigations={data.investigations} accounts={data.accounts.map(a => ({...a,allowed:data.grants.some(g => g.accountId === a.id)}))} />
    <section className="panel mt-4" aria-labelledby="closing-counts-title"><h2 id="closing-counts-title" className="panel-title">Independent actual evidence</h2><ul className="mt-3 space-y-3">{data.checks.map(c => <li className="break-words rounded-md border border-border p-4" key={c.id}><strong>{operator(c.collectorId)} · {c.method}: {formatPhp(c.grossActual)}</strong> — {c.sourceHash === data.sourceHash ? "Current source" : "Earlier source — recheck before submission"}<br />{c.caseId && <><Link href={`/investigations/${c.caseId}`} className="underline">Linked investigation</Link>. </>}Checked by {operator(c.checkedBy)}, {pht(c.createdAt)}. Evidence {c.evidenceReference}: {c.notes}. {c.accountId && <>Account {data.accounts.find(a => a.id === c.accountId)?.label}. </>}{c.method === "CASH" && <>Held {formatPhp(c.cashHeld)}, transferred {formatPhp(c.transferred)}, payouts from batch {formatPhp(c.paidFromBatch)}.</>}</li>)}</ul></section>
    <section className="panel mt-4" aria-labelledby="closing-history-title"><h2 id="closing-history-title" className="panel-title">Immutable closing history</h2>
      {!data.snapshots.length && <p className="mt-2">No submitted snapshot. Counts and open-item review are preparation only.</p>}
      {data.snapshots.map(snapshot => {
        const captured = snapshot.source as unknown as { items: ClosingItem[]; collections: typeof data.collections; refundMovements?: typeof data.refundMovements };
        const approval = data.approvals.find(a => a.snapshotId === snapshot.id);
        return <article id={`snapshot-${snapshot.id}`} className="mt-5 break-words rounded-xl border border-border bg-card p-5 sm:p-6" key={snapshot.id}>
          <h3 className="text-lg font-semibold"><Link href={`/closing?day=${snapshot.day}#snapshot-${snapshot.id}`} className="underline">{snapshot.revision === 1 ? "Original closing" : `Supplement ${snapshot.revision-1}`}</Link></h3>
          <p className="mt-2 text-sm">Submitted by {operator(snapshot.submittedBy)}, {pht(snapshot.createdAt)}. Reference {snapshot.evidenceReference}. {snapshot.notes}</p>
          {snapshot.previousId && <p className="mt-2 text-sm"><a href={`#snapshot-${snapshot.previousId}`} className="underline">Previous immutable snapshot</a></p>}
          <p className="mt-2 font-medium">{approval ? `Owner acknowledged unresolved differences: ${operator(approval.approvedBy)}, ${pht(approval.createdAt)}. ${approval.evidenceReference}: ${approval.notes}` : "Awaiting owner review; differences remain unresolved."}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{data.lines.filter(l => l.snapshotId === snapshot.id).map(line => <div key={line.id} className="border-l-4 border-primary pl-4"><h4 className="font-semibold">{operator(line.collectorId)} · {line.method}</h4>{totals(line)}<p className="mt-2 text-sm">Evidence: {data.links.filter(link => link.lineId === line.id).map(link => data.checks.find(c => c.id === link.checkId)?.evidenceReference).join(", ")}</p></div>)}</div>
          <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 underline">Captured outstanding items and transaction sources</summary>{items(captured.items)}{captured.refundMovements ? refunds(captured.refundMovements) : <p className="mt-2 text-sm">This earlier snapshot preserves allocated totals; actual payout methods were not separately captured.</p>}<ul className="mt-3 space-y-2">{captured.collections.map(p => <li key={p.id}>{p.receiptId && <Link className="underline" href={`/receipts/${p.receiptId}`}>Original payment receipt</Link>}: {formatPhp(p.amountCentavos)} {p.method}; collected {pht(p.collectedAt)}, entered {pht(p.enteredAt)}, verified {pht(p.verifiedAt)}. {p.excluded && "Excluded false record; original preserved."}</li>)}</ul></details>
        </article>;
      })}
    </section>
    <section className="panel mt-4" aria-labelledby="closing-events-title"><h2 id="closing-events-title" className="panel-title">Linked collection, recovery, correction and settlement events</h2><p className="mt-2 text-sm">Later events explain earlier collections. They do not rewrite a snapshot or count a recovery again on entry day.</p><ul className="mt-3 space-y-3">{data.changes.map(e => <li key={e.id} className="break-words"><Link className="underline" href={e.href}>{e.kind} — {e.outcome}</Link>; {e.collectedAt && <>original collection {pht(e.collectedAt)}; </>}{e.enteredAt && <>entry {pht(e.enteredAt)}; </>}event by {operator(e.actorId)} {pht(e.createdAt)}; {e.settledAt && <>actual settlement {pht(e.settledAt)}; </>}{e.evidenceReference} {e.settlementReference}</li>)}</ul></section>
  </>;
}

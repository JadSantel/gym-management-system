import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { pilotEvidence } from "@/lib/pilot";
import { IdentityError } from "@/lib/identity";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPhp } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function PilotPage({ searchParams }: { searchParams: Promise<{start?: string | string[]; end?: string | string[]}> }) {
  const query = await searchParams;
  const today = new Date(new Date().getTime() + 8 * 3_600_000).toISOString().slice(0,10);
  const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0,10);
  const data = await pilotEvidence(await headers(),{ start: query.start ?? today, end: query.end ?? tomorrow }).catch(error => {
    if (error instanceof IdentityError && error.status === 400) return null;
    if (error instanceof IdentityError) redirect("/"); throw error;
  });
  const pht = (value: Date) => new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"long",hourCycle:"h23"}).format(value);
  return <><Link href="/" className="underline">Back to home</Link><h1 className="mt-5 text-[28px] font-semibold tracking-tight">Pilot evidence review</h1>
    <p className="mt-3">SYNTHETIC local records only. Independent collection denominators, timing and adoption observations belong in the reviewed measurement worksheet. Application rows alone cannot prove completeness or improvement.</p>
    <form className="mt-5 flex flex-wrap items-end gap-4" method="get"><div><label htmlFor="pilot-start">Start date (Manila, inclusive)</label><Input id="pilot-start" name="start" type="date" required defaultValue={typeof query.start === "string" ? query.start : today} /></div><div><label htmlFor="pilot-end">End date (Manila, exclusive)</label><Input id="pilot-end" name="end" type="date" required defaultValue={typeof query.end === "string" ? query.end : tomorrow} /></div><Button type="submit">Review pilot evidence</Button></form>
    {!data ? <p role="alert" className="mt-5">Choose valid dates spanning 1–31 days. Duplicate date parameters are invalid.</p> : <>
      <p className="mt-4">{data.gymName}. Window {data.start} inclusive to {data.end} exclusive. Retrieved {pht(data.asOf)}. Preserve this retrieval time with worksheet revisions.</p>
      <p className="mt-3 font-semibold">Denominator UNKNOWN · baseline NOT VERIFIED · measured improvement NOT VERIFIED · live readiness BLOCKED.</p>
      {data.truncated && <p role="alert" className="mt-3">INCOMPLETE: a source list exceeds 200 rows. Only the first 200 are shown. Narrow collection windows; review complete legacy/case history separately. Do not calculate complete-window rates from this view.</p>}
      <h2 id="pilot-collections" className="mt-7 text-xl font-semibold">Collection and later-entry evidence</h2>
      <p className="mt-2 text-sm">In-window original collections and in-window entries of earlier collections are shown separately. Recovery counts once under its original collection, never as new entry-day income. A pending claim is not a verified collection.</p>
      <ul className="mt-3 space-y-4" aria-labelledby="pilot-collections">{data.payments.slice(0,200).map(p => {
        const confirmation = data.confirmations.find(c => c.paymentId === p.id); const entry = data.entries.find(e => e.id === confirmation?.entryId);
        const collectionDay = new Date(p.collectedAt.getTime()+8*3_600_000).toISOString().slice(0,10);
        return <li key={p.id} className="min-w-0 break-words rounded-md border border-border p-4 text-sm">
          <h3 className="font-semibold"><Link className="underline" href={`/members/${p.memberId}`}>{p.reference}</Link></h3>
          <p className="mt-2">{collectionDay < data.start ? "PRE-WINDOW COLLECTION / LATER ENTRY" : "IN-WINDOW COLLECTION"} · {p.method} · {formatPhp(p.amountCentavos)}</p><p className="mt-1 break-all">Payment {p.id}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><dt className="font-medium">Actual collection</dt><dd>{pht(p.collectedAt)}</dd></div>
            <div><dt className="font-medium">Paper issuance</dt><dd>{entry ? <>{pht(entry.issuedAt)} · <Link className="underline" href={`/outage-receipts#entry-${entry.id}`}>paper source</Link></> : "Not recorded"}</dd></div>
            <div><dt className="font-medium">First CRM entry</dt><dd>{pht(p.enteredAt)}</dd></div>
            <div><dt className="font-medium">Verification</dt><dd>{pht(p.verifiedAt)}</dd></div>
            <div><dt className="font-medium">CRM receipt issuance</dt><dd>{p.receipt ? pht(p.receipt.issuedAt) : "Missing"}</dd></div>
          </dl>
        </li>;
      })}</ul>
      {data.payments.length === 0 && <p className="mt-3">No matching CRM collections. Independent denominator remains UNKNOWN.</p>}
      <h2 className="mt-7 text-xl font-semibold">Historical access and legacy exceptions — excluded from collections</h2><ul className="mt-3 space-y-2">{data.legacy.slice(0,200).map(row => <li key={row.id} className="break-words"><Link className="underline" href={`/members/${row.memberId}#legacy-${row.id}`}>{row.sourceReference}</Link> · {row.kind === "APPROVE" ? "HISTORICAL_ENTITLEMENT" : row.uncertainty !== "CERTAIN" || row.kind === "FLAG" || row.kind === "REJECT" ? "LEGACY_EXCEPTION" : "LEGACY_REVIEW_PENDING"} · {row.uncertainty} · actual entry/decision {pht(row.createdAt)}</li>)}</ul>
      <h2 className="mt-7 text-xl font-semibold">Investigation evidence and settlement</h2><p className="mt-2">Cases are not collection denominators. Categorize and de-duplicate incidents in the worksheet. Approval alone is not actual settlement.</p><ul className="mt-3 space-y-2">{data.cases.slice(0,200).map(c => <li key={c.id}><Link className="underline" href={`/investigations/${c.id}`}>{c.reason}: {c.summary}</Link></li>)}{data.settlements.slice(0,200).map(s => <li key={s.id}><Link className="underline" href={`/investigations/${s.caseId}#event-${s.id}`}>Actual settlement {s.settlementReference}</Link>: {formatPhp(s.amountCentavos!)} · {s.method} · settled {pht(s.settledAt!)} · entered {pht(s.createdAt)}</li>)}</ul>
      <p className="mt-7"><Link href="/closing" className="underline">Review immutable closing snapshots and unresolved differences</Link>. Closing active-time requires observed work segments; submission timestamps are not duration measurements.</p>
    </>}
  </>;
}

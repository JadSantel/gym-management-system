import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IdentityError } from "@/lib/identity";
import { outageOverview } from "@/lib/outage";
import { OutageActions } from "@/components/outage-actions";
import { formatPhp } from "@/lib/money";
export const dynamic = "force-dynamic";

export default async function OutagePage() {
  const data = await outageOverview(await headers()).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  const pht = (date: Date) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(date)+" PHT";
  const operator = (id: string) => data.operators.find(o => o.id === id)?.user.name ?? "Preserved operator reference";
  const member = (id: string) => data.members.find(m => m.id === id)?.fullName ?? "Member";
  const grant = data.verifiers.find(v => v.operatorId === data.operatorId)?.active;
  return <><Link href="/" className="underline">Back to home</Link><h1 className="mt-5 text-[28px] font-semibold tracking-tight">Outage receipts and custody</h1>
    <p className="mt-3 max-w-3xl text-muted-foreground">Full cash and a controlled paper receipt may document one provisional visit. Back-entry remains pending until independent verification. No automatic repeat admission or additional payment is implied.</p>
    <p className="mt-3 text-sm">During an outage, use pre-prepared paper receipts and signed physical counts at every shift handover. This page records them after recovery. Local synthetic use only; live operations remain unavailable.</p>
    <p className="mt-3 text-sm">Designated independent verifiers: {data.verifiers.filter(v => v.active).map(v => operator(v.operatorId)).join(", ") || "None available — keep receipts pending"}. A collector or entrant cannot verify their own record.</p>
    <OutageActions owner={data.owner} operatorId={data.operatorId} recoveryScope={data.recoveryScope} books={data.books} prices={data.prices}
      operators={data.operators.map(o => ({ id:o.id, name:`${o.user.name}${o.state !== "ACTIVE" ? " (former operator)" : ""}` }))}
      entries={data.entries.filter(e => !data.confirmations.some(c => c.entryId === e.id)).map(e => ({ id:e.id,bookId:e.bookId,number:e.number,memberName:member(e.memberId),amountCentavos:e.amountCentavos,eligibleVerifier:!!grant && e.collectorId !== data.operatorId && e.enteredBy !== data.operatorId }))} />
    <section className="mt-8" aria-labelledby="outage-registry-title"><h2 id="outage-registry-title" className="text-xl font-semibold">Controlled registry and paper price lists</h2>
      {!data.books.length && <p className="mt-3">Unavailable: no controlled booklet is registered. Ask a freshly reauthenticated owner to register physical stock before use.</p>}
      <ul className="mt-4 space-y-5">{data.books.map(book => {
        const latest = data.handovers.filter(h => h.bookId === book.id).at(-1);
        const counts = latest?.counts as {used:number[];unused:number[];void:number[];missing:number[]}|undefined;
        return <li key={book.id} id={`book-${book.id}`} className="rounded-xl border border-border bg-card p-5 break-words">
          <h3 className="font-semibold">{book.code} · numbers {book.firstNumber}–{book.lastNumber}</h3><p className="mt-2 text-sm">Registered {pht(book.createdAt)} by {operator(book.createdBy)}. Initial custodian: {operator(book.custodianId)}. Latest recorded custodian: {operator(latest?.toId ?? book.custodianId)}.</p>
          <p className="mt-2 text-sm">{counts ? `Last physical count — used: ${counts.used.join(", ") || "none"}; unused: ${counts.unused.join(", ") || "none"}; void: ${counts.void.join(", ") || "none"}; missing: ${counts.missing.join(", ") || "none"}.` : `No recovered shift count yet. ${book.lastNumber-book.firstNumber+1} registered leaves await physical accounting; no use inferred.`}</p>
          {counts && <p className="mt-2 text-sm">Used numbers still awaiting back-entry: {counts.used.filter(n => !data.entries.some(e => e.bookId === book.id && e.number === n)).join(", ") || "none"}. Missing and void numbers remain open evidence, without invented money.</p>}
          <ul className="mt-3 text-sm">{data.prices.filter(p => p.bookId === book.id).map(p => <li key={p.id}>{p.planName} · {p.durationDays} days · {formatPhp(p.priceCentavos)} · version {p.planVersion}. Keep this approved snapshot with the physical booklet.</li>)}</ul>
        </li>;
      })}</ul>
    </section>
    <section className="mt-8" aria-labelledby="outage-pending-title"><h2 id="outage-pending-title" className="text-xl font-semibold">Paper receipt recovery</h2>
      {!data.entries.length && <p className="mt-3">No recovered paper receipt claims.</p>}
      <ol className="mt-4 space-y-5">{data.entries.map(entry => {
        const confirmation = data.confirmations.find(c => c.entryId === entry.id); const receipt = data.receipts.find(r => r.paymentId === confirmation?.paymentId);
        const price = data.prices.find(p => p.id === entry.priceId); const review = data.events.some(e => e.bookId === entry.bookId && e.number === entry.number && e.outcome === "OWNER_REVIEW");
        return <li id={`entry-${entry.id}`} key={entry.id} className="rounded-xl border border-border bg-card p-5 break-words">
          <h3 className="font-semibold">{data.books.find(b => b.id === entry.bookId)?.code}-{entry.number} · {confirmation ? "Verified" : "Pending verification"}{review ? " · Owner review / exception recorded" : ""}</h3>
          <p className="mt-2"><Link className="underline" href={`/members/${entry.memberId}`}>{member(entry.memberId)}</Link> · {formatPhp(entry.amountCentavos)} CASH · {price?.planName} / {price?.durationDays} days.</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Original collector / collection</dt><dd>{operator(entry.collectorId)} · {pht(entry.collectedAt)}</dd></div><div><dt className="text-muted-foreground">Original paper issuance</dt><dd>{pht(entry.issuedAt)} · {entry.receiptReference}</dd></div><div><dt className="text-muted-foreground">Later entrant / system entry</dt><dd>{operator(entry.enteredBy)} · {pht(entry.enteredAt)}</dd></div><div><dt className="text-muted-foreground">Original cash record</dt><dd>{entry.cashReference}</dd></div></dl>
          <p className="mt-3 text-sm">{entry.visitAt ? `One original provisional visit: ${pht(entry.visitAt)}, authorized by ${operator(entry.visitAuthorizerId!)}, reference ${entry.visitReference}. This receipt grants no second visit.` : "No provisional visit documented on this entry."}</p>
          {!confirmation ? <p className="mt-3 font-medium">No new normal entitlement granted. {grant && entry.collectorId !== data.operatorId && entry.enteredBy !== data.operatorId ? "Independent verification needs matched receipt, cash and recovered signed handover." : "Unavailable to this operator: a designated verifier independent of collector and entrant is required."}</p>
            : <p className="mt-3 text-sm">Independently verified by {operator(receipt!.payment.verifiedBy)} · {pht(receipt!.payment.verifiedAt)}. <Link href={`/receipts/${receipt!.id}`} className="underline">Linked digital receipt</Link>. Paper visit remains separate.</p>}
        </li>;
      })}</ol>
    </section>
    <section className="mt-8" aria-labelledby="outage-handover-title"><h2 id="outage-handover-title" className="text-xl font-semibold">Physical custody handovers</h2><ol className="mt-4 space-y-4">{data.handovers.map(h => <li key={h.id} className="break-words rounded-xl border border-border bg-card p-5 text-sm">{data.books.find(b => b.id === h.bookId)?.code}: {operator(h.fromId)} to {operator(h.toId)}. Actual handover {pht(h.actualAt)}; recovery entry {pht(h.enteredAt)} by {operator(h.enteredBy)}. Both physical signatures attested.<p className="mt-2">{Object.entries(h.counts as Record<string, number[]>).map(([kind,numbers]) => `${kind}: ${numbers.join(", ") || "none"}`).join("; ")}.</p><p className="mt-2">Cash held {formatPhp(h.cashHeld)}; transferred {formatPhp(h.cashTransferred)}. Transfer reference {h.transferReference}. Signed record {h.evidenceReference}.</p><p className="mt-2">Outstanding: {h.outstanding}. No difference was automatically cleared.</p></li>)}</ol></section>
    <section className="mt-8" aria-labelledby="outage-events-title"><h2 id="outage-events-title" className="text-xl font-semibold">Preserved accountability and investigations</h2><ol className="mt-4 space-y-3">{data.events.map(e => <li id={`event-${e.id}`} key={e.id} className="break-words border-l-2 border-border pl-4 text-sm"><strong>{e.kind} · {e.outcome}</strong> · {operator(e.actorId)} · {pht(e.createdAt)}{e.number && <> · receipt {data.books.find(b => b.id === e.bookId)?.code}-{e.number}</>}{e.kind === "EXCEPTION" && <p>{(e.command as {kind:string;reasoning:string}).kind}: {(e.command as {reasoning:string}).reasoning}. Evidence reference: {(e.command as {evidenceReference:string}).evidenceReference}.</p>}{e.caseId && <> · <Link href={`/investigations/${e.caseId}`} className="underline">Owner investigation</Link></>}</li>)}</ol></section>
  </>;
}

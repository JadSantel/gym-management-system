import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { attendanceHistory } from "@/lib/attendance";
import { IdentityError } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VisitCorrection } from "@/components/visit-correction";
import styles from "./attendance.module.css";
export const dynamic = "force-dynamic";
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "medium" });
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const result = await attendanceHistory(await headers(), await searchParams).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400) return { error: error.message }; redirect("/"); } throw error;
  });
  if ("error" in result) return <section className="panel" role="alert"><h1>Check attendance filters</h1><p className="my-4">{result.error}</p><Link href="/attendance" className="action-link">Reset to today</Link></section>;
  const pageLink = (page: number) => `/attendance?${new URLSearchParams({ from: result.from, to: result.to, member: result.member, view: result.view, page: String(page) })}`;
  return <><div className="page-heading"><div><h1>Attendance</h1><p>Recorded arrivals, departures and missing checkouts. Times are in Asia/Manila.</p></div><Link href="/attendance/scanner" className="action-link">Open scanner</Link></div>
    <form className="panel mb-6 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap sm:gap-4" action="/attendance">
      <label htmlFor="attendance-from" className="min-w-0">From<Input id="attendance-from" name="from" type="date" className="min-w-0 px-1 text-sm sm:px-2 sm:text-base" defaultValue={result.from} required /></label>
      <label htmlFor="attendance-to" className="min-w-0">To<Input id="attendance-to" name="to" type="date" className="min-w-0 px-1 text-sm sm:px-2 sm:text-base" defaultValue={result.to} required /></label>
      <label htmlFor="attendance-member" className="min-w-0 sm:grow sm:basis-44">Member<Input id="attendance-member" name="member" maxLength={100} defaultValue={result.member} /></label>
      <label htmlFor="attendance-view" className="min-w-0">View<select id="attendance-view" name="view" defaultValue={result.view} className="min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-2"><option value="ALL">All visits</option><option value="IN">Currently in gym</option><option value="MISSING">Missing checkout</option></select></label>
      <div className="col-span-2 flex items-center gap-4"><Button type="submit">Apply filters</Button><Link href="/attendance" className="inline-flex min-h-11 items-center text-sm underline">Today</Link></div>
    </form>
    <section className={`panel ${styles.history}`} aria-labelledby="visits-title"><h2 id="visits-title" className="panel-title">Visits</h2>
      <p role="status" className="mb-4 mt-2 text-sm text-muted-foreground">{result.count} matching visits. Page {result.page} of {result.pages}. Checked {pht.format(new Date(result.checkedAt))} PHT.</p>
      <Table className={styles.table}><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Arrival</TableHead><TableHead>Departure</TableHead><TableHead>Status</TableHead><TableHead>History and corrections</TableHead></TableRow></TableHeader>
        <TableBody>{result.visits.length ? result.visits.map(visit => <TableRow key={visit.id}>
          <TableCell data-label="Member"><Link href={`/members/${visit.memberId}`} className="font-medium underline">{visit.memberName}</Link></TableCell>
          <TableCell data-label="Arrival">{pht.format(new Date(visit.arrivedAt))}</TableCell><TableCell data-label="Departure">{visit.departedAt ? pht.format(new Date(visit.departedAt)) : "Not recorded"}</TableCell>
          <TableCell data-label="Status">{visit.status}</TableCell>
          <TableCell data-label="History"><div className="min-w-0"><details><summary className="min-h-11 cursor-pointer py-3 font-medium">Original events and changes</summary><ol className="space-y-3 text-sm">{visit.events.map(event => <li key={event.revision} className="border-t border-border pt-3">
            <p>{event.revision}. {event.kind} · {event.actor} · {pht.format(new Date(event.recordedAt))} PHT</p><p>Arrival: {pht.format(new Date(event.arrivedAt))}. Departure: {event.departedAt ? pht.format(new Date(event.departedAt)) : "Not recorded"}.</p>{event.reason && <p>Reason: {event.reason}</p>}
          </li>)}</ol></details>{!visit.voided && <VisitCorrection key={`${visit.id}:${visit.revision}`} id={visit.id} revision={visit.revision} arrivedAt={visit.arrivedAt} departedAt={visit.departedAt} />}</div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={5}>No visits match these filters. Older unclosed visits appear as Missing checkout on their arrival date.</TableCell></TableRow>}</TableBody>
      </Table>
      <nav aria-label="Attendance pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">{result.page > 1 ? <Link className="action-link secondary" href={pageLink(result.page - 1)}>Previous page</Link> : <Button disabled variant="outline">Previous page</Button>}{result.page < result.pages ? <Link className="action-link secondary" href={pageLink(result.page + 1)}>Next page</Link> : <Button disabled variant="outline">Next page</Button>}</nav>
      <p className="mt-5 text-sm text-muted-foreground">A past-day visit with no departure is Missing checkout; no exit time is invented. Attendance changes never alter payments or entitlement.</p>
    </section></>;
}

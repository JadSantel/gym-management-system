"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LogIn, LogOut, RefreshCw, ScanLine, Search, Users } from "lucide-react";
import type { attendanceHistory } from "@/lib/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VisitCorrection } from "@/components/visit-correction";
import { AttendanceOccupancy } from "@/components/attendance-occupancy";
import styles from "@/app/attendance/attendance.module.css";

type History = Awaited<ReturnType<typeof attendanceHistory>>;
const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const fullTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "medium" });

function duration(visit: History["visits"][number], checkedAt: string) {
  if (visit.voided || visit.status === "Missing checkout") return "Not recorded";
  const minutes = Math.max(0, Math.floor((Date.parse(visit.departedAt ?? checkedAt) - Date.parse(visit.arrivedAt)) / 60_000));
  return minutes < 1 ? "Less than 1 min" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AttendanceHistory({ data }: { data: History }) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(data.member), [dateOpen, setDateOpen] = useState(false);
  const [range, setRange] = useState({ from: data.from, to: data.to }), [dateError, setDateError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const selected = data.visits.find(visit => visit.id === selectedId);
  const today = data.summary.today, isToday = data.from === today && data.to === today;
  function navigate(patch: Record<string, string> = {}, paginationOnly = false) {
    if (pending) return;
    const params = new URLSearchParams({ from: data.from, to: data.to, member: paginationOnly ? data.member : search,
      view: data.view, pageSize: String(data.pageSize), page: "1", ...patch });
    startTransition(() => router.push(`/attendance?${params}`, { scroll: false }));
  }
  const first = data.count ? (data.page - 1) * data.pageSize + 1 : 0, last = Math.min(data.page * data.pageSize, data.count);
  return <section className={styles.screen} aria-label="Attendance history" aria-busy={pending}>
    <div className="page-heading"><div><h1>Attendance</h1><p>Recorded arrivals, departures and time in the gym.</p></div><Link href="/attendance/scanner" className="action-link"><ScanLine aria-hidden="true" className="size-4" />Open scanner</Link></div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="text-sm font-medium">Today · {date.format(new Date(data.checkedAt))}</p>
      <p className="text-xs text-muted-foreground">As of {time.format(new Date(data.checkedAt))} PHT</p>
    </div>
    <div className={styles.stats} role="group" aria-label="Today’s attendance summary">
      {[
        { label: "Checked in today", value: data.summary.checkedIn, icon: LogIn },
        { label: "Inside now", value: data.summary.inside, icon: Users },
        { label: "Checked out", value: data.summary.checkedOut, icon: LogOut },
      ].map(item => <Card key={item.label} className="gap-0 rounded-lg py-4 shadow-none sm:py-5"><CardContent className="px-3 sm:px-5"><div className="flex items-start justify-between gap-2"><h2 className="min-h-10 text-xs font-medium text-muted-foreground sm:min-h-0 sm:text-sm">{item.label}</h2><item.icon aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" /></div><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:mt-4">{item.value}</p></CardContent></Card>)}
    </div>
    <AttendanceOccupancy hours={data.summary.hours} today={today} />
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h2 className="text-base font-semibold">Visit history</h2><p className="text-xs text-muted-foreground">Daily summary stays on today</p></div>
    <div className="rounded-lg border border-border bg-card">
      <div className={styles.toolbar}>
        <form role="search" aria-label="Search attendance" onSubmit={event => { event.preventDefault(); navigate(); }} className="flex min-w-0 flex-[1_1_240px] gap-2">
          <div className="relative min-w-0 flex-1"><label htmlFor="attendance-member" className="sr-only">Search members</label><Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input id="attendance-member" name="member" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members…" className="pl-9" readOnly={pending} /></div><Button type="submit" variant="outline" disabled={pending}>Search</Button>
          <Button type="button" variant="outline" aria-label="Refresh attendance" title="Refresh attendance" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="size-11 shrink-0 p-0"><RefreshCw aria-hidden="true" className="size-4" /></Button>
        </form>
        <ToggleGroup type="single" value={data.view} onValueChange={value => { if (value) navigate({ view: value }); }} variant="outline" disabled={pending} aria-label="Visit status" className="max-w-full">
          {[{ value: "ALL", label: "All" }, { value: "IN", label: "Inside" }, { value: "OUT", label: "Finished" }].map(item => <ToggleGroupItem key={item.value} value={item.value} className="min-h-11 px-4 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <Popover open={dateOpen} onOpenChange={open => { if (pending) return; setDateOpen(open); if (open) { setRange({ from: data.from, to: data.to }); setDateError(""); } }}>
          <PopoverTrigger asChild><Button variant="outline" disabled={pending}><CalendarDays aria-hidden="true" className="size-4" />{isToday ? "Today" : "Date range"}</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))]" aria-label="Attendance date range">
            <h3 className="text-sm font-semibold">Visit dates</h3><p className="mt-1 text-xs text-muted-foreground">Arrival dates in Asia/Manila, both dates included.</p>
            <form onSubmit={event => { event.preventDefault(); if (range.from > range.to) { setDateError("End date must be on or after start date."); return; } setDateOpen(false); navigate(range); }} className="mt-4 grid min-w-0 grid-cols-2 gap-3">
              <label htmlFor="attendance-from" className="min-w-0 text-xs">From<Input id="attendance-from" type="date" required value={range.from} onChange={event => setRange({ ...range, from: event.target.value })} className="mt-1 min-w-0 px-1 text-sm" /></label>
              <label htmlFor="attendance-to" className="min-w-0 text-xs">To<Input id="attendance-to" type="date" required value={range.to} aria-invalid={!!dateError} aria-describedby={dateError ? "attendance-date-error" : undefined} onChange={event => setRange({ ...range, to: event.target.value })} className="mt-1 min-w-0 px-1 text-sm" /></label>
              {dateError && <p id="attendance-date-error" role="alert" className="col-span-2 text-xs text-destructive">{dateError}</p>}
              <Button type="submit" className="col-span-2">Apply dates</Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setDateOpen(false); navigate({ from: today, to: today }); }}>Today</Button><Button variant="outline" onClick={() => { setDateOpen(false); navigate({ view: "MISSING" }); }}>Missing checkout</Button></div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground"><p>{isToday ? "Today’s visits" : `${date.format(new Date(`${data.from}T00:00:00+08:00`))} – ${date.format(new Date(`${data.to}T00:00:00+08:00`))}`}{data.view === "MISSING" && " · Missing checkout"} · {data.count} {data.count === 1 ? "visit" : "visits"}</p>{(data.member || !isToday || data.view !== "ALL") && <Button variant="outline" className="min-h-11 border-transparent bg-transparent px-2 text-xs" disabled={pending} onClick={() => { setSearch(""); navigate({ from: today, to: today, member: "", view: "ALL" }); }}>Reset filters</Button>}</div>
      <Table className={styles.table} aria-label="Attendance visits">
        <TableHeader><TableRow>{["Member", "Time In", "Time Out", "Duration", "Status"].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.visits.length ? data.visits.map(visit => <TableRow key={visit.id}>
          <TableCell data-label="Member"><div className="flex min-w-0 items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-3"><span className="initial-avatar" aria-hidden="true">{visit.memberName.split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0"><Link href={`/members/${visit.memberId}`} className="font-semibold hover:underline">{visit.memberName}</Link></div></div><Button variant="outline" aria-label={`View visit for ${visit.memberName}`} onClick={event => { invoker.current = event.currentTarget; setSelectedId(visit.id); }} className="size-11 shrink-0 border-transparent bg-transparent p-0"><ChevronRight aria-hidden="true" className="size-4" /></Button></div></TableCell>
          <TableCell data-label="Time In"><time dateTime={visit.arrivedAt} className="tabular-nums">{time.format(new Date(visit.arrivedAt))}<span className="mt-1 block text-xs text-muted-foreground">{date.format(new Date(visit.arrivedAt))}</span></time></TableCell>
          <TableCell data-label="Time Out">{visit.departedAt ? <time dateTime={visit.departedAt} className="tabular-nums">{time.format(new Date(visit.departedAt))}<span className="mt-1 block text-xs text-muted-foreground">{date.format(new Date(visit.departedAt))}</span></time> : <span className="text-muted-foreground">Not recorded</span>}</TableCell>
          <TableCell data-label="Duration"><span className="tabular-nums">{duration(visit, data.checkedAt)}</span>{visit.status === "Currently in gym" && <span className="mt-1 block text-xs text-muted-foreground">Ongoing</span>}</TableCell>
          <TableCell data-label="Status"><Badge variant="outline" className={visit.voided ? "border-destructive/30 bg-destructive/10 text-destructive" : visit.status === "Missing checkout" ? "border-attention/30 bg-attention-surface text-attention" : visit.status === "Currently in gym" ? "border-success/30 bg-success-surface text-success" : "border-border bg-muted text-foreground"}>{visit.status === "Currently in gym" ? "Inside" : visit.status === "Checked out" ? "Finished" : visit.status}</Badge></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={5} className={styles.empty}><p className="font-medium">No visits match these filters.</p><p className="mt-2 text-sm text-muted-foreground">Try another name, status or date range. Recorded visits will appear here.</p></TableCell></TableRow>}</TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-4 text-xs">
        <p role="status" className="text-muted-foreground">{pending ? "Loading attendance…" : `Showing ${first}–${last} of ${data.count} visits. Dates in Asia/Manila.`}</p>
        <nav aria-label="Attendance pages" className="flex w-full flex-wrap items-center justify-between gap-3 xl:w-auto">
          <label htmlFor="attendance-page-size" className="flex items-center gap-2 font-medium">Rows per page<select id="attendance-page-size" value={data.pageSize} disabled={pending} onChange={event => navigate({ pageSize: event.target.value }, true)} className="min-h-11 rounded-md border border-border bg-card px-3 text-sm">{[10, 20, 30].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <span className="ml-auto whitespace-nowrap font-medium">Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">{[{ label: "First page", page: 1, icon: ChevronsLeft, disabled: data.page === 1 }, { label: "Previous page", page: data.page - 1, icon: ChevronLeft, disabled: data.page === 1 }, { label: "Next page", page: data.page + 1, icon: ChevronRight, disabled: data.page === data.pages }, { label: "Last page", page: data.pages, icon: ChevronsRight, disabled: data.page === data.pages }].map(action => <Button key={action.label} variant="outline" aria-label={action.label} disabled={pending || action.disabled} onClick={() => navigate({ page: String(action.page) }, true)} className="size-11 p-0"><action.icon aria-hidden="true" className="size-4" /></Button>)}</div>
        </nav>
      </div>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Past-day visits without a departure remain Missing checkout; their duration is unknown. Open a visit to review original events or make an audited correction. Attendance never changes membership or payment.</p>
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelectedId(null); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md [&>button]:top-1 [&>button]:right-1 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center" onCloseAutoFocus={event => { event.preventDefault(); invoker.current?.focus(); }}><SheetHeader className="pr-14"><SheetTitle>Visit details</SheetTitle><SheetDescription>{selected?.memberName} · Times in Asia/Manila</SheetDescription></SheetHeader>
        {selected && <div className="min-w-0 px-4 pb-8"><dl className="space-y-3 border-b border-border pb-5 text-sm"><div><dt className="text-muted-foreground">Time In</dt><dd>{fullTime.format(new Date(selected.arrivedAt))} PHT</dd></div><div><dt className="text-muted-foreground">Time Out</dt><dd>{selected.departedAt ? `${fullTime.format(new Date(selected.departedAt))} PHT` : "Not recorded"}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd>{selected.status}</dd></div></dl>
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Original events and changes</summary><ol className="space-y-3 text-sm">{selected.events.map(event => <li key={event.revision} className="border-t border-border pt-3"><p>{event.revision}. {event.kind} · {event.actor} · {fullTime.format(new Date(event.recordedAt))} PHT</p><p>Arrival: {fullTime.format(new Date(event.arrivedAt))}. Departure: {event.departedAt ? fullTime.format(new Date(event.departedAt)) : "Not recorded"}.</p>{event.reason && <p className="break-words">Reason: {event.reason}</p>}</li>)}</ol></details>
          {!selected.voided && <VisitCorrection key={`${selected.id}:${selected.revision}`} id={selected.id} revision={selected.revision} arrivedAt={selected.arrivedAt} departedAt={selected.departedAt} />}
        </div>}
      </SheetContent>
    </Sheet>
  </section>;
}

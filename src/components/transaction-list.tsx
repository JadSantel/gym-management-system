"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Landmark, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPhp } from "@/lib/money";
import type { HistoryQuery } from "@/lib/history-schema";
import type { PaymentHistoryData } from "@/lib/payment-history";
import styles from "./payment-activity.module.css";

export type TransactionRow = {
  id: string; reference: string; memberId: string; member: string; method: string;
  amount: number; at: string; collector: string; plan: string;
  receipt: { reference: string; href: string } | null;
  period: { from: string; to: string } | null;
};
const dateTime = (value: string) => `${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))} PHT`;
const day = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`));
const methodName = (method: string) => method === "CASH" ? "Cash" : method === "BANK" ? "Bank transfer (historical)" : method === "GCASH" ? "GCash (historical)" : method;

export function TransactionList({ rows, summary, filters, operators, pagination, today, canCollect }: {
  rows: TransactionRow[]; summary: PaymentHistoryData["summary"]; filters: HistoryQuery;
  operators: PaymentHistoryData["operators"]; pagination: PaymentHistoryData["pagination"]; today: string; canCollect: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.member ?? "");
  const [reference, setReference] = useState(filters.reference ?? "");
  const [collectorId, setCollectorId] = useState(filters.collectorId ?? "");
  const range = { from: filters.from || filters.date || "", to: filters.to || filters.date || "" };
  const [draft, setDraft] = useState(range);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateError, setDateError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const filterKey = JSON.stringify(filters);
  const [previousFilters, setPreviousFilters] = useState(filterKey);
  // Sync URL/back navigation without remounting the controls and losing keyboard focus.
  if (previousFilters !== filterKey) {
    setPreviousFilters(filterKey);
    setSearch(filters.member ?? "");
    setReference(filters.reference ?? "");
    setCollectorId(filters.collectorId ?? "");
    setDetailOpen(false);
  }
  const status = filters.status || "ALL";
  const method = filters.method || "";
  const activeFilters = Object.entries(filters).some(([key, value]) => key !== "page" && key !== "pageSize" && !!value);
  const firstRow = rows.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRow = rows.length ? firstRow + rows.length - 1 : 0;
  const dateLabel = range.from && range.to ? `${day(range.from)} – ${day(range.to)}` : range.from ? `From ${day(range.from)}` : range.to ? `Through ${day(range.to)}` : "All dates";

  function navigate(patch: Partial<HistoryQuery> = {}, paginationOnly = false) {
    if (pending) return;
    const next: HistoryQuery = { ...filters, date: undefined, ...range,
      ...(paginationOnly ? {} : { member: search, reference, collectorId, page: "1" }), ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    startTransition(() => router.push(`/transactions${params.size ? `?${params}` : ""}`, { scroll: false }));
  }
  function reset() { if (!pending) startTransition(() => router.push(`/transactions${filters.pageSize ? `?pageSize=${filters.pageSize}` : ""}`, { scroll: false })); }
  function show(row: TransactionRow, button: HTMLButtonElement) { invoker.current = button; setSelected(row); setDetailOpen(true); }

  return <section aria-label="Payment history" className={styles.screen} aria-busy={pending}>
    <div className="page-heading"><div><h1>Payments</h1><p>Membership payments, all in one place.</p></div>{canCollect && <Link href="/members#search-name" className="action-link">Record cash payment <span aria-hidden="true">+</span></Link>}</div>
    <div className={`${styles.summary} mb-7`} role="group" aria-label="Payment summary">
      {[
        { label: "Revenue", value: formatPhp(summary.amount), note: "Original confirmed collections · all methods", icon: ArrowDownLeft },
        { label: "Total transactions", value: String(summary.count), note: "Confirmed payments", icon: ReceiptText },
        { label: "Cash", value: formatPhp(summary.cash.amount), note: `${summary.cash.count} confirmed transactions`, icon: Banknote },
        { label: "Bank transfer", value: formatPhp(summary.bank.amount), note: `${summary.bank.count} historical transactions`, icon: Landmark },
      ].map(item => <Card key={item.label} className="gap-0 rounded-lg py-5 shadow-none"><CardContent className="px-4 sm:px-5">
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground"><span>{item.label}</span><item.icon aria-hidden="true" className="size-4 shrink-0" /></div>
        <p className="mt-4 break-words text-2xl leading-tight font-semibold tracking-tight tabular-nums">{item.value}</p>
        <p className="mt-3 text-xs text-muted-foreground">{item.note}</p>
      </CardContent></Card>)}
    </div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 className="text-base font-semibold">Payment activity</h2><p className="text-xs text-muted-foreground">Summary cards follow the date range only</p></div>
    <div className="rounded-lg border border-border bg-card">
      <div role="search" aria-label="Search payment history" className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <form onSubmit={event => { event.preventDefault(); navigate(); }} className="flex min-w-0 flex-[1_1_280px] gap-2">
          <div className="relative min-w-0 flex-1"><label htmlFor="transaction-search" className="sr-only">Search members</label><Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input id="transaction-search" name="member" type="search" maxLength={100} placeholder="Search members…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" readOnly={pending} /></div>
          <Button variant="outline" type="submit" aria-disabled={pending}>Search</Button>
        </form>
        <Popover open={dateOpen} onOpenChange={open => { if (pending) return; setDateOpen(open); if (open) { setDraft(range); setDateError(""); } }}>
          <PopoverTrigger asChild><Button variant="outline" aria-disabled={pending} className="max-w-full text-left"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><span className="min-w-0 whitespace-normal">{dateLabel}</span><ChevronDown aria-hidden="true" className="size-3.5 shrink-0" /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))]" aria-label="Date range">
            <h3 className="text-sm font-semibold">Date range</h3><p className="mt-1 text-xs text-muted-foreground">Payment dates in Asia/Manila. Both dates included.</p>
            <div className="my-4 flex flex-wrap gap-2">{[
              { label: "Today", from: today, to: today },
              { label: "Last 7 days", from: new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10), to: today },
              { label: "All time", from: "", to: "" },
            ].map(preset => <Button key={preset.label} variant="outline" className="px-3 text-xs" onClick={() => { setDraft({ from: preset.from, to: preset.to }); setDateError(""); }}>{preset.label}</Button>)}</div>
            <form onSubmit={event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const values = { from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") };
              setDraft(values);
              if (values.from && values.to && values.from > values.to) { setDateError("End date must be on or after start date."); return; }
              setDateOpen(false); navigate(values);
            }}>
              <label htmlFor="payment-date-from" className="text-xs font-medium">From</label><Input id="payment-date-from" name="from" type="date" value={draft.from} onChange={event => { setDraft({ ...draft, from: event.target.value }); setDateError(""); }} className="mt-1 mb-3" />
              <label htmlFor="payment-date-to" className="text-xs font-medium">To</label><Input id="payment-date-to" name="to" type="date" value={draft.to} aria-invalid={!!dateError} aria-describedby={dateError ? "payment-date-error" : undefined} onChange={event => { setDraft({ ...draft, to: event.target.value }); setDateError(""); }} className="mt-1" />
              {dateError && <p id="payment-date-error" role="alert" className="mt-2 text-xs text-destructive">{dateError}</p>}
              <Button type="submit" className="mt-4 w-full">Apply date range</Button>
            </form>
          </PopoverContent>
        </Popover>
        <ToggleGroup type="single" value={status} aria-disabled={pending} onValueChange={value => { if (value) navigate({ status: value === "ALL" ? "" : value as HistoryQuery["status"] }); }} aria-label="Payment status" className="max-w-full gap-1 rounded-md bg-muted p-1">
          {([["ALL", "All"], ["CONFIRMED", "Confirmed"], ["PENDING", "Pending"]] as const).map(([value, label]) => <ToggleGroupItem key={value} value={value} className="min-h-11 rounded-sm! px-3 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground">{label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground">Method</span>
          {([["", "All methods"], ["CASH", "Cash"], ["BANK", "Bank transfer"], ["GCASH", "GCash (historical)"]] as const).map(([value, label]) => <Button key={value} variant="outline" aria-disabled={pending} aria-pressed={method === value} onClick={() => navigate({ method: value })} className={method === value ? "border-primary bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90" : "px-3 text-xs"}>{value === "CASH" && <Banknote aria-hidden="true" className="size-3.5" />}{value === "BANK" && <Landmark aria-hidden="true" className="size-3.5" />}{label}</Button>)}
          <Popover open={advancedOpen} onOpenChange={open => { if (!pending) setAdvancedOpen(open); }}>
            <PopoverTrigger asChild><Button variant="outline" aria-disabled={pending} className="px-3 text-xs"><SlidersHorizontal aria-hidden="true" className="size-3.5" />More filters{(filters.reference || filters.collectorId || filters.memberId) && <span className="sr-only"> (active)</span>}</Button></PopoverTrigger>
            <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))]" aria-label="More payment filters"><h3 className="mb-4 text-sm font-semibold">More filters</h3>
              <form onSubmit={event => { event.preventDefault(); setAdvancedOpen(false); navigate(); }}>
                <label htmlFor="payment-reference" className="text-xs font-medium">Payment or receipt reference</label><Input id="payment-reference" value={reference} maxLength={100} onChange={event => setReference(event.target.value)} className="mt-1 mb-4" />
                <label htmlFor="payment-collector" className="text-xs font-medium">Collector</label><select id="payment-collector" value={collectorId} onChange={event => setCollectorId(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">All collectors</option>{operators.map(operator => <option key={operator.id} value={operator.id}>{operator.user.name}</option>)}</select>
                {filters.memberId && <p className="mt-3 text-xs text-muted-foreground">Scoped to one member. Reset filters to show everyone.</p>}
                <Button type="submit" className="mt-4 w-full">Apply filters</Button>
              </form>
            </PopoverContent>
          </Popover>
          {activeFilters && <Button variant="outline" aria-disabled={pending} className="ml-auto gap-1.5 px-3 text-xs" onClick={reset}><X aria-hidden="true" className="size-3.5" />Reset filters</Button>}
        </div>
      </div>
      <Table className={styles.table}>
        <caption className="sr-only">Membership payment history. Open a member name for payment details or follow the receipt link.</caption>
        <TableHeader><TableRow className="hover:bg-transparent">{["Member", "Method", "Amount", "Status", "Receipt"].map(label => <TableHead key={label} scope="col" className={label === "Amount" ? "text-right" : ""}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.id} className="cursor-pointer" onClick={event => { if (!(event.target as Element).closest("a,button")) event.currentTarget.querySelector<HTMLButtonElement>("button")?.click(); }}>
            <TableCell data-label="Member" className="whitespace-normal"><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">{row.member.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("")}</span><div className="min-w-0"><button type="button" onClick={event => show(row, event.currentTarget)} className="min-h-11 max-w-full cursor-pointer py-1 text-left text-[13px] font-semibold whitespace-normal break-words hover:underline">{row.member}<time dateTime={row.at} className="mt-0.5 block text-xs font-normal text-muted-foreground">{dateTime(row.at)}</time></button></div></div></TableCell>
            <TableCell data-label="Method" className="whitespace-normal"><span className="inline-flex items-center gap-2 text-[13px]">{row.method === "CASH" ? <Banknote aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : <Landmark aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}{methodName(row.method)}</span></TableCell>
            <TableCell data-label="Amount" className="text-right font-medium tabular-nums">{formatPhp(row.amount)}</TableCell>
            <TableCell data-label="Status"><Badge className="gap-1.5 border-0 bg-success-surface text-success"><Check aria-hidden="true" className="size-3" />Confirmed</Badge></TableCell>
            <TableCell data-label="Receipt">{row.receipt ? <Link href={row.receipt.href} className="inline-flex min-h-11 items-center gap-1.5 text-xs hover:underline" aria-label={`View receipt for ${row.member}`}><ReceiptText aria-hidden="true" className="size-3.5" />View receipt<ArrowUpRight aria-hidden="true" className="size-3" /></Link> : <span className="text-xs text-muted-foreground">Not available</span>}</TableCell>
          </TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={5} className="h-48 text-center whitespace-normal"><div className="mx-auto max-w-md"><p className="text-sm font-medium">{status === "PENDING" ? "No pending payments in this history" : "No matching payments"}</p><p className="mt-1 text-xs text-muted-foreground">{status === "PENDING" ? "Only confirmed collections appear here. Historical unverified claims remain on member profiles and do not count as revenue or paid access." : "Try another name or clear your filters."}</p><Button variant="outline" aria-disabled={pending} onClick={reset} className="mt-4">Clear filters</Button></div></TableCell></TableRow>}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4 text-xs">
        <p role="status" aria-live="polite" className="text-muted-foreground">{pending ? "Updating payment history…" : `Showing ${firstRow}–${lastRow} of ${pagination.totalRows} payments. Dates in Asia/Manila.`}<span className="sr-only"> Page {pagination.page} of {pagination.totalPages}.</span></p>
        <nav aria-label="Payment pages" className="flex w-full flex-wrap items-center justify-between gap-3 lg:w-auto">
          <label htmlFor="payment-page-size" className="flex items-center gap-2 font-medium">Rows per page
            <select id="payment-page-size" value={String(pagination.pageSize)} aria-disabled={pending} onChange={event => navigate({ pageSize: event.target.value as HistoryQuery["pageSize"], page: "1" }, true)} className="min-h-11 rounded-md border border-border bg-card px-3 text-sm text-foreground aria-disabled:opacity-50">
              {[10, 20, 30].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <span className="ml-auto whitespace-nowrap font-medium">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            {[
              { label: "First page", page: 1, unavailable: pagination.page === 1, icon: ChevronsLeft },
              { label: "Previous page", page: pagination.page - 1, unavailable: pagination.page === 1, icon: ChevronLeft },
              { label: "Next page", page: pagination.page + 1, unavailable: pagination.page === pagination.totalPages, icon: ChevronRight },
              { label: "Last page", page: pagination.totalPages, unavailable: pagination.page === pagination.totalPages, icon: ChevronsRight },
            ].map(action => <Button key={action.label} variant="outline" aria-label={action.label} aria-disabled={pending || action.unavailable} tabIndex={action.unavailable ? -1 : 0} onClick={() => { if (!action.unavailable) navigate({ page: String(action.page) }, true); }} className="min-w-11 px-3 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"><action.icon aria-hidden="true" className="size-4" /></Button>)}
          </div>
        </nav>
      </div>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Full cash collection only. Historical digital records are read-only. Totals show original confirmed collections, before historical corrections or refunds.</p>
    <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
      <SheetContent showCloseButton={false} className="w-full overflow-y-auto border-border sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); invoker.current?.focus(); }}>
        <SheetHeader className="border-b border-border pb-5 pr-16"><SheetTitle>Payment details</SheetTitle><SheetDescription>Original confirmed collection · read-only</SheetDescription></SheetHeader>
        <SheetClose asChild><Button variant="outline" aria-label="Close payment details" className="absolute top-3 right-3 min-w-11 px-3"><X aria-hidden="true" className="size-4" /></Button></SheetClose>
        {selected && <div className="px-5 pb-8"><Badge className="border-0 bg-success-surface text-success">Confirmed</Badge><h3 className="mt-5 break-words text-xl font-semibold">{selected.member}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.plan}</p><p className="my-7 break-words text-4xl font-semibold tracking-tight tabular-nums">{formatPhp(selected.amount)}</p>
          <dl className="space-y-4 text-sm">{[["Method", methodName(selected.method)], ["Collected", dateTime(selected.at)], ["Collector", selected.collector], ["Payment reference", selected.reference], ["Receipt", selected.receipt?.reference ?? "Not available"], ...(selected.period ? [["Paid period starts", dateTime(selected.period.from)], ["Paid period ends (exclusive)", dateTime(selected.period.to)]] : [])].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-border pb-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 max-w-full text-right font-medium [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
          <div className="mt-6 flex flex-wrap gap-3"><Link className="action-link" href={`/members/${selected.memberId}`}>Open member</Link>{selected.receipt && <Link className="action-link" href={selected.receipt.href}>View receipt</Link>}</div>
          <p className="mt-5 text-xs text-muted-foreground">A recorded payment does not by itself establish current eligibility. Check the member profile before admission.</p>
        </div>}
      </SheetContent>
    </Sheet>
  </section>;
}

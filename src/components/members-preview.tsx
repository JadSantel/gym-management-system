"use client";

import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, Check, ChevronDown, Landmark, ReceiptText, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "./payment-activity.module.css";

// Fictional design fixtures only. This preview never reads or writes payments.
const samples = [
  { id: "001", member: "Isabel Santos", initials: "IS", plan: "Monthly · 30 days", method: "Cash", amount: 80000, status: "Confirmed", date: "2026-11-02", time: "10:42 AM" },
  { id: "002", member: "Marco Reyes", initials: "MR", plan: "3 Months · 90 days", method: "Bank transfer", amount: 210000, status: "Confirmed", date: "2026-11-02", time: "10:18 AM" },
  { id: "003", member: "Sofia Cruz", initials: "SC", plan: "Monthly · 30 days", method: "Bank transfer", amount: 80000, status: "Pending", date: "2026-11-02", time: "9:56 AM" },
  { id: "004", member: "Daniel Garcia", initials: "DG", plan: "6 Months · 180 days", method: "Cash", amount: 400000, status: "Confirmed", date: "2026-11-01", time: "4:32 PM" },
  { id: "005", member: "Camille Mendoza", initials: "CM", plan: "Monthly · 30 days", method: "Cash", amount: 80000, status: "Confirmed", date: "2026-11-01", time: "2:15 PM" },
  { id: "006", member: "Nico Villanueva", initials: "NV", plan: "3 Months · 90 days", method: "Bank transfer", amount: 210000, status: "Pending", date: "2026-10-31", time: "11:08 AM" },
  { id: "007", member: "Andrea Lim", initials: "AL", plan: "3 Months · 90 days", method: "Cash", amount: 210000, status: "Confirmed", date: "2026-10-30", time: "5:24 PM" },
  { id: "008", member: "Luis Navarro", initials: "LN", plan: "Monthly · 30 days", method: "Bank transfer", amount: 80000, status: "Confirmed", date: "2026-10-29", time: "8:45 AM" },
] as const;
type Sample = typeof samples[number];
type Status = "All" | "Confirmed" | "Pending";
type Method = "All" | "Cash" | "Bank transfer";
const money = (centavos: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(centavos / 100);
const day = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`));

function PaymentStatus({ status }: { status: Sample["status"] }) {
  return <Badge className={status === "Confirmed" ? "gap-1.5 border-0 bg-success-surface text-success" : "gap-1.5 border-0 bg-attention-surface text-attention"}>
    {status === "Confirmed" ? <Check aria-hidden="true" className="size-3" /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}{status}
  </Badge>;
}

export function MembersPreview() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("All");
  const [method, setMethod] = useState<Method>("All");
  const [range, setRange] = useState({ from: "", to: "" });
  const [draft, setDraft] = useState(range);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateError, setDateError] = useState("");
  const [selected, setSelected] = useState<Sample | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const invoker = useRef<HTMLButtonElement | null>(null);
  const dateRows = samples.filter(row => (!range.from || row.date >= range.from) && (!range.to || row.date <= range.to));
  const rows = dateRows.filter(row => row.member.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (status === "All" || row.status === status) && (method === "All" || row.method === method));
  const confirmed = dateRows.filter(row => row.status === "Confirmed");
  const total = (records: readonly Sample[]) => records.reduce((sum, row) => sum + row.amount, 0);
  const cash = confirmed.filter(row => row.method === "Cash");
  const bank = confirmed.filter(row => row.method === "Bank transfer");
  const activeFilters = !!search || status !== "All" || method !== "All" || !!range.from || !!range.to;
  const dateLabel = range.from && range.to ? `${day(range.from)} – ${day(range.to)}` : range.from ? `From ${day(range.from)}` : range.to ? `Through ${day(range.to)}` : "All dates";

  function reset() { setSearch(""); setStatus("All"); setMethod("All"); setRange({ from: "", to: "" }); }
  function show(row: Sample, button: HTMLButtonElement) { invoker.current = button; setSelected(row); setDetailOpen(true); }

  return <section aria-label="Members screen preview" className={styles.screen}>
    <div className="page-heading">
      <div><h1>Members</h1><p>Membership payments, all in one place.</p></div>
      <Badge className="self-start border-border bg-card text-muted-foreground">Interactive preview</Badge>
    </div>
    <p className="mb-6 text-xs leading-relaxed text-muted-foreground">Sample data for design review. Bank transfers and pending payments are illustrative; this screen does not record collections.</p>

    <div className={`${styles.summary} mb-7`} aria-label="Payment summary">
      {[
        { label: "Revenue", value: money(total(confirmed)), note: "Confirmed payments only", icon: ArrowDownLeft },
        { label: "Total transactions", value: String(dateRows.length).padStart(2, "0"), note: `${confirmed.length} confirmed · ${dateRows.length - confirmed.length} pending`, icon: ReceiptText },
        { label: "Cash", value: money(total(cash)), note: `${cash.length} confirmed transactions`, icon: Banknote },
        { label: "Bank transfer", value: money(total(bank)), note: `${bank.length} confirmed transactions`, icon: Landmark },
      ].map(item => <Card key={item.label} className="gap-0 rounded-lg py-5 shadow-none"><CardContent className="px-4 sm:px-5">
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground"><span>{item.label}</span><item.icon aria-hidden="true" className="size-4" /></div>
        <p className="mt-4 text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-[28px]">{item.value}</p>
        <p className="mt-3 text-xs text-muted-foreground">{item.note}</p>
      </CardContent></Card>)}
    </div>

    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-base font-semibold">Payment activity</h2>
      <p className="text-xs text-muted-foreground">Summary cards follow the date range</p>
    </div>
    <div className="rounded-lg border border-border bg-card">
      <div role="search" aria-label="Filter sample payments" className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="relative min-w-0 flex-[1_1_230px]">
          <label htmlFor="preview-member-search" className="sr-only">Search members</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input id="preview-member-search" placeholder="Search members…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" />
        </div>
        <Popover open={dateOpen} onOpenChange={open => { setDateOpen(open); if (open) { setDraft(range); setDateError(""); } }}>
          <PopoverTrigger asChild><Button variant="outline" className="max-w-full text-left"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><span className="min-w-0 whitespace-normal">{dateLabel}</span><ChevronDown aria-hidden="true" className="size-3.5 shrink-0" /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))]" aria-label="Date range">
            <h3 className="text-sm font-semibold">Date range</h3><p className="mt-1 text-xs text-muted-foreground">Payment dates in Asia/Manila. Both dates included.</p>
            <div className="my-4 flex flex-wrap gap-2">{[
              { label: "Today", from: "2026-11-02", to: "2026-11-02" },
              { label: "Last 7 days", from: "2026-10-27", to: "2026-11-02" },
              { label: "All time", from: "", to: "" },
            ].map(preset => <Button key={preset.label} variant="outline" className="px-3 text-xs" onClick={() => { setDraft({ from: preset.from, to: preset.to }); setDateError(""); }}>{preset.label}</Button>)}</div>
            <p className="mb-3 text-xs text-muted-foreground">Preview date: November 2, 2026</p>
            <form onSubmit={event => { event.preventDefault(); if (draft.from && draft.to && draft.from > draft.to) { setDateError("End date must be on or after start date."); return; } setRange(draft); setDateOpen(false); }}>
              <label htmlFor="preview-date-from" className="text-xs font-medium">From</label><Input id="preview-date-from" type="date" value={draft.from} onChange={event => { setDraft({ ...draft, from: event.target.value }); setDateError(""); }} className="mt-1 mb-3" />
              <label htmlFor="preview-date-to" className="text-xs font-medium">To</label><Input id="preview-date-to" type="date" value={draft.to} aria-invalid={!!dateError} aria-describedby={dateError ? "preview-date-error" : undefined} onChange={event => { setDraft({ ...draft, to: event.target.value }); setDateError(""); }} className="mt-1" />
              {dateError && <p id="preview-date-error" role="alert" className="mt-2 text-xs text-destructive">{dateError}</p>}
              <Button type="submit" className="mt-4 w-full">Apply date range</Button>
            </form>
          </PopoverContent>
        </Popover>
        <ToggleGroup type="single" value={status} onValueChange={value => { if (value) setStatus(value as Status); }} aria-label="Payment status" className="max-w-full gap-1 rounded-md bg-muted p-1">
          {(["All", "Confirmed", "Pending"] as const).map(value => <ToggleGroupItem key={value} value={value} className="min-h-11 rounded-sm! px-3 text-xs data-[state=on]:bg-card data-[state=on]:text-foreground">{value}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground">Method</span>
          {(["All", "Cash", "Bank transfer"] as const).map(value => <Button key={value} variant="outline" aria-pressed={method === value} onClick={() => setMethod(value)} className={method === value ? "border-primary bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90" : "px-3 text-xs"}>
            {value === "Cash" && <Banknote aria-hidden="true" className="size-3.5" />}{value === "Bank transfer" && <Landmark aria-hidden="true" className="size-3.5" />}{value === "All" ? "All methods" : value}
          </Button>)}
          {activeFilters && <Button variant="outline" className="ml-auto gap-1.5 px-3 text-xs" onClick={reset}><X aria-hidden="true" className="size-3.5" />Reset filters</Button>}
        </div>
      </div>
      <Table className={styles.table}>
        <caption className="sr-only">Sample membership payment activity. Click a member or receipt to view details.</caption>
        <TableHeader><TableRow className="hover:bg-transparent">{["Member", "Method", "Amount", "Status", "Receipt"].map(label => <TableHead key={label} scope="col" className={label === "Amount" ? "text-right" : ""}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.id} className="cursor-pointer" onClick={event => { if (!(event.target as Element).closest("button")) event.currentTarget.querySelector<HTMLButtonElement>("button")?.click(); }}>
            <TableCell data-label="Member"><div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">{row.initials}</span>
              <div><button type="button" onClick={event => show(row, event.currentTarget)} className="min-h-11 cursor-pointer py-1 text-left text-[13px] font-semibold hover:underline"><span>{row.member}</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">{day(row.date)} · {row.time}</span></button></div>
            </div></TableCell>
            <TableCell data-label="Method"><span className="inline-flex items-center gap-2 text-[13px]">{row.method === "Cash" ? <Banknote aria-hidden="true" className="size-4 text-muted-foreground" /> : <Landmark aria-hidden="true" className="size-4 text-muted-foreground" />}{row.method}</span></TableCell>
            <TableCell data-label="Amount" className="text-right font-medium tabular-nums">{money(row.amount)}</TableCell>
            <TableCell data-label="Status"><PaymentStatus status={row.status} /></TableCell>
            <TableCell data-label="Receipt">{row.status === "Confirmed" ? <Button variant="outline" aria-label={`View receipt for ${row.member}`} onClick={event => show(row, event.currentTarget)} className="gap-1.5 border-transparent bg-transparent px-2 text-xs hover:border-border"><ReceiptText aria-hidden="true" className="size-3.5" />View receipt<ArrowUpRight aria-hidden="true" className="size-3" /></Button> : <span className="text-xs text-muted-foreground">Not issued</span>}</TableCell>
          </TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={5} className="h-48 text-center"><p className="text-sm font-medium">No matching payments</p><p className="mt-1 text-xs text-muted-foreground">Try another name or clear your filters.</p><Button variant="outline" onClick={reset} className="mt-4">Clear filters</Button></TableCell></TableRow>}
        </TableBody>
      </Table>
      <div role="status" aria-live="polite" className="border-t border-border px-5 py-4 text-xs text-muted-foreground">Showing {rows.length} of {samples.length} sample transactions <span aria-hidden="true">·</span> Dates in Asia/Manila</div>
    </div>

    <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
      <SheetContent className="w-full overflow-y-auto border-border sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); invoker.current?.focus(); }}>
        <SheetHeader className="border-b border-border pb-5 pr-12"><SheetTitle>{selected?.status === "Confirmed" ? "Sample receipt" : "Payment details"}</SheetTitle><SheetDescription>Design preview · fictional transaction</SheetDescription></SheetHeader>
        {selected && <div className="px-5 pb-8">
          <PaymentStatus status={selected.status} /><h3 className="mt-5 text-xl font-semibold">{selected.member}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.plan}</p>
          <p className="my-7 text-4xl font-semibold tracking-tight tabular-nums">{money(selected.amount)}</p>
          <dl className="space-y-4 text-sm">{[["Method", selected.method], ["Payment date", `${day(selected.date)} · ${selected.time} PHT`], ["Receipt", selected.status === "Confirmed" ? `DEMO-2026-${selected.id}` : "Not issued"]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-border pb-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl>
          <p className="mt-6 rounded-md bg-muted p-4 text-sm leading-relaxed">{selected.status === "Pending" ? "Pending payment. No receipt has been issued. This amount is excluded from revenue and does not grant membership access." : "This is a sample receipt for layout review. It is not proof of payment and cannot be used for gym admission."}</p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => setDetailOpen(false)}>Back to payments</Button>
        </div>}
      </SheetContent>
    </Sheet>
  </section>;
}

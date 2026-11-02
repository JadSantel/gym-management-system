"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, MoreHorizontal, RefreshCw, Search, UserCheck, Users } from "lucide-react";
import { createColumnHelper, createPaginatedRowModel, createSortedRowModel, rowPaginationFeature, rowSortingFeature, sortFn_text, tableFeatures, useTable, type SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { directoryMembership, type DirectoryMember } from "@/lib/member-directory";
import { memberCreateSchema, memberFieldErrors, memberSearchSchema, type MemberFieldErrors } from "@/lib/member-schema";
import styles from "./member-directory.module.css";

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature,
  sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel(), sortFns: { text: sortFn_text } });
type DirectoryRow = DirectoryMember & { membership: ReturnType<typeof directoryMembership> };
const helper = createColumnHelper<typeof features, DirectoryRow>();
const pht = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const filters = ["All members", "Active", "Expiring soon", "Pending"] as const;
type MemberFilter = typeof filters[number];
const columns = helper.columns([
  helper.accessor("fullName", { sortFn: "text", header: ({ column }) => <Button variant="outline" className="border-transparent bg-transparent px-0 shadow-none" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
    Member{column.getIsSorted() === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />}</Button>,
    cell: ({ row }) => <div className="flex items-center gap-3"><span className="initial-avatar" aria-hidden="true">{row.original.fullName.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div className="min-w-0">
      <Link href={`/members/${row.original.id}`} className="font-semibold hover:underline">{row.original.fullName}</Link>
      <div className="mt-1"><span className={`status-label ${row.original.membership.active ? row.original.membership.expiringSoon ? "attention" : "success" : row.original.membership.status === "EXPIRED" ? "danger" : ""}`}>{row.original.membership.label}</span></div>
      {row.original.membership.active && row.original.entitlements.some(interval => new Date(interval.startsAt) >= row.original.membership.interval!.endsAt) && <p className="mt-1 text-xs text-muted-foreground">Paid next term scheduled</p>}
    </div></div>,
  }),
  helper.accessor(member => member.email ?? "", { id: "email", sortFn: "text", header: ({ column }) => <Button variant="outline" className="border-transparent bg-transparent px-0 shadow-none" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
    Email{column.getIsSorted() ? column.getIsSorted() === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" /> : <ArrowUpDown aria-hidden="true" className="size-3.5" />}</Button>,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.email ?? "Not recorded"}</span>,
  }),
  helper.accessor("phone", { header: "Phone #", cell: ({ row }) => <span className="text-muted-foreground">{row.original.phone ?? "Not recorded"}</span> }),
  helper.display({ id: "startsAt", header: "Membership started", cell: ({ row }) => row.original.membership.interval ? <time dateTime={row.original.membership.interval.startsAt.toISOString()}>{pht.format(row.original.membership.interval.startsAt)} PHT</time> : <span className="text-muted-foreground">No membership</span> }),
  helper.display({ id: "endsAt", header: "Membership expires", cell: ({ row }) => row.original.membership.interval ? <time dateTime={row.original.membership.interval.endsAt.toISOString()}>{pht.format(row.original.membership.interval.endsAt)} PHT</time> : <span className="text-muted-foreground">No membership</span> }),
  helper.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline" className="size-11 border-transparent bg-transparent p-0" aria-label={`Actions for ${row.original.fullName}`}><MoreHorizontal aria-hidden="true" className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuItem asChild className="min-h-11"><Link href={`/members/${row.original.id}`}>View customer</Link></DropdownMenuItem>
      <DropdownMenuItem asChild className="min-h-11"><Link href={`/members/${row.original.id}#member-payments`}>View payment details</Link></DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu> }),
]);
const labels: Record<string, string> = { fullName: "Member", email: "Email", phone: "Phone #", startsAt: "Membership started", endsAt: "Membership expires", actions: "Actions" };

export function MemberDirectory({ initial, checkedAt }: { initial: DirectoryMember[]; checkedAt: string }) {
  const [members, setMembers] = useState(initial);
  const [checkTime, setCheckTime] = useState(checkedAt);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("All members");
  const [sorting, setSorting] = useState<SortingState>([{ id: "fullName", desc: false }]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [createErrors, setCreateErrors] = useState<MemberFieldErrors>({});
  const [searchError, setSearchError] = useState("");
  const [createAttempted, setCreateAttempted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const rows = useMemo(() => members.map(member => ({ ...member, membership: directoryMembership(member, checkTime) })), [members, checkTime]);
  const visible = useMemo(() => rows.filter(member => member.fullName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (filter === "All members" || filter === "Active" && member.membership.active || filter === "Expiring soon" && member.membership.expiringSoon || filter === "Pending" && member.membership.pending)), [rows, search, filter]);
  const table = useTable({ features, data: visible, columns, getRowId: row => row.id,
    state: { sorting }, onSortingChange: setSorting, initialState: { pagination: { pageIndex: 0, pageSize: 10 } } });
  const pagination = table.state.pagination;
  const pageRows = table.getRowModel().rows;
  useEffect(() => { if (feedback.error) feedbackRef.current?.focus(); }, [feedback]);

  async function refresh() {
    const failure = "Unable to refresh members. Showing the last loaded records. Try Refresh again.";
    const response = await fetch("/api/members/directory", { cache: "no-store" }).catch(() => { throw new Error(failure); });
    const result = await response.json().catch(() => { throw new Error(failure); });
    if (!response.ok) throw new Error(result.error ?? failure);
    setMembers(result.members); setCheckTime(result.checkedAt); table.setPageIndex(0);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault(); setBusy(true); setFeedback({ message: "", error: false });
    setCreateErrors({}); setSearchError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!create) {
        const parsed = memberSearchSchema.safeParse(search);
        if (!parsed.success) { setSearchError(parsed.error.issues[0].message); throw new Error("Check the member search below."); }
        await refresh(); setFeedback({ message: "Member list refreshed.", error: false }); return;
      }
      setCreateAttempted(true);
      const input = { fullName: String(form.get("name") ?? ""), confirmDuplicate: form.has("confirmDuplicate") };
      const parsed = memberCreateSchema.safeParse(input);
      if (!parsed.success) { setCreateErrors(memberFieldErrors(parsed.error)); throw new Error("Check the member fields below."); }
      if (duplicate && !input.confirmDuplicate) {
        setCreateErrors({ confirmDuplicate: "Confirm that you reviewed the matches and this is a separate person." });
        throw new Error("Review the matching members before creating another person.");
      }
      const response = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) {
        setCreateErrors(result.fieldErrors ?? {});
        if (response.status === 409) { setDuplicate(true); setSearch(parsed.data.fullName); setFilter("All members"); table.setPageIndex(0); await refresh(); }
        throw new Error(result.error);
      }
      setMembers(previous => [...previous, { id: result.id, fullName: result.fullName, email: null, phone: null, hasVerifiedMembership: false, entitlements: [] }]);
      setSearch(result.fullName); setFilter("All members"); table.setPageIndex(0); setDuplicate(false);
      setFeedback({ message: "Member created. Review the member record before collecting payment.", error: false });
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Unable to connect. Try again.", error: true }); }
    finally { setBusy(false); }
  }

  return <div className={`${styles.directory} space-y-6`}>
    <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label="Member summary">
      {[
        { label: "Total members", value: rows.length, note: "All member profiles", icon: Users },
        { label: "Active", value: rows.filter(row => row.membership.active).length, note: "Verified membership in effect", icon: UserCheck },
        { label: "Expiring soon", value: rows.filter(row => row.membership.expiringSoon).length, note: "Active term ends within 7 days", icon: CalendarClock },
      ].map(item => <Card key={item.label} className="gap-0 rounded-lg py-5 shadow-none"><CardContent className="px-5"><div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{item.label}</span><item.icon aria-hidden="true" className="size-4 shrink-0" /></div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{item.value.toLocaleString("en-PH")}</p><p className="mt-2 text-xs text-muted-foreground">{item.note}</p></CardContent></Card>)}
    </div>
    <div id="member-feedback" ref={feedbackRef} tabIndex={-1} role={feedback.error ? "alert" : "status"} className={`text-sm outline-offset-4 ${feedback.message ? "panel" : "sr-only"}`}>
      {feedback.message}{searchError && <a href="#search-name" className="ml-2 underline">Review member search</a>}
      {createErrors.fullName && <a href="#member-name" className="ml-2 underline">Review full name</a>}
      {createErrors.confirmDuplicate && <a href="#duplicate-review" className="ml-2 underline">Review duplicate confirmation</a>}
    </div>
    <section aria-labelledby="search-title" aria-busy={busy}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="search-title" className="panel-title">Find a member</h2><p className="text-xs text-muted-foreground">Counts cover all members</p></div>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <form noValidate onSubmit={event => submit(event, false)} className="flex min-w-0 flex-[1_1_280px] gap-2">
            <div className="relative min-w-0 flex-1"><label htmlFor="search-name" className="sr-only">Search members by name</label><Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <Input id="search-name" name="name" type="search" maxLength={100} placeholder="Search members…" className="pl-9" value={search} readOnly={busy} aria-invalid={!!searchError} aria-describedby={searchError ? "search-name-error" : undefined}
                onChange={event => { setSearch(event.target.value); setSearchError(""); table.setPageIndex(0); }} /></div>
            <Button type="submit" variant="outline" disabled={busy} aria-label="Refresh members"><RefreshCw aria-hidden="true" className={`size-4 ${busy ? "animate-spin" : ""}`} /><span className="sr-only sm:not-sr-only">Refresh</span></Button>
          </form>
          <ToggleGroup type="single" value={filter} onValueChange={value => { if (value) { setFilter(value as MemberFilter); table.setPageIndex(0); } }} aria-label="Filter members by status" spacing={1} className="max-w-full flex-wrap justify-start gap-1" disabled={busy}>
            {filters.map(label => <ToggleGroupItem key={label} value={label} className="min-h-11 rounded-md px-3 text-[13px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{label}</ToggleGroupItem>)}
          </ToggleGroup>
          {searchError && <p id="search-name-error" className="w-full text-sm text-destructive">{searchError}</p>}
        </div>
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground"><p>{filter === "Pending" ? "Pending: profiles with no verified membership yet. No paid access is granted." : filter === "Expiring soon" ? "Active memberships with 7 days or less remaining. Includes terms with a paid next term scheduled." : "Expiring soon is included in Active. Pending means no verified membership yet."}</p></div>
        <div className={styles.mobileSort} role="group" aria-label="Sort members"><span className="text-xs text-muted-foreground">Sort by</span>{["fullName", "email"].map(id => <Button key={id} variant="outline" onClick={() => table.getColumn(id)!.toggleSorting(table.getColumn(id)!.getIsSorted() === "asc")}>{labels[id]}<ArrowUpDown aria-hidden="true" className="size-3.5" /><span className="sr-only">{table.getColumn(id)!.getIsSorted() || "unsorted"}</span></Button>)}</div>
        <Table className={styles.table} aria-label="Members">
          <TableHeader><TableRow>{table.getHeaderGroups()[0].headers.map(header => <TableHead key={header.id} scope="col" aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : undefined}><table.FlexRender header={header} /></TableHead>)}</TableRow></TableHeader>
          <TableBody>{pageRows.length ? pageRows.map(row => <TableRow key={row.id}>{row.getAllCells().map(cell => <TableCell key={cell.id} data-label={labels[cell.column.id]}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="h-40 text-center"><p className="font-medium">{members.length ? "No members match this filter." : "No members to show yet."}</p><p className="mt-2 text-xs text-muted-foreground">{members.length ? "Try another name or status." : "Search first, then create a member below."}</p></TableCell></TableRow>}</TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><p role="status" className="text-xs text-muted-foreground">{visible.length ? pagination.pageIndex * pagination.pageSize + 1 : 0}–{Math.min((pagination.pageIndex + 1) * pagination.pageSize, visible.length)} of {visible.length} members</p>
          <nav aria-label="Member pages" className="flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-muted-foreground">Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><Button variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage() || busy}>Previous</Button><Button variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage() || busy}>Next</Button></nav></div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Email and phone are not recorded. Dates show the current, next scheduled, or latest expired membership in PHT; expiry is exclusive.</p>
      <p className="mt-2 text-xs text-muted-foreground">Eligibility checked {pht.format(new Date(checkTime))} PHT. Refresh to update. Open a profile for the current access decision before admission.</p>
    </section>
    <section id="new-member" aria-labelledby="create-title" className="panel"><h2 id="create-title" className="panel-title">Create a member</h2><p className="mb-5 mt-2 text-sm text-muted-foreground">Search first to avoid duplicates. Creating a member records no payment and grants no paid access.</p>
      <form noValidate onSubmit={event => submit(event, true)} className="space-y-4"><label htmlFor="member-name">Full name<Input id="member-name" name="name" required maxLength={100} autoComplete="off" disabled={busy}
        aria-invalid={!!createErrors.fullName} aria-describedby={createErrors.fullName ? "member-name-error" : undefined} onChange={event => {
          setDuplicate(false);
          const parsed = memberCreateSchema.shape.fullName.safeParse(event.currentTarget.value);
          setCreateErrors(createAttempted && !parsed.success ? { fullName: parsed.error.issues[0].message } : {});
        }} /></label>
        {createErrors.fullName && <p id="member-name-error" className="text-sm text-destructive">{createErrors.fullName}</p>}
        {duplicate && <><label className="flex min-h-11 items-start gap-3 text-sm"><input id="duplicate-review" name="confirmDuplicate" type="checkbox" required disabled={busy} className="mt-1 size-5"
          aria-invalid={!!createErrors.confirmDuplicate} aria-describedby={createErrors.confirmDuplicate ? "duplicate-review-error" : undefined}
          onChange={event => setCreateErrors(event.currentTarget.checked ? {} : { confirmDuplicate: "Confirm that you reviewed the matches and this is a separate person." })} />I reviewed the matches. This is a separate person with the same name.</label>
          {createErrors.confirmDuplicate && <p id="duplicate-review-error" className="text-sm text-destructive">{createErrors.confirmDuplicate}</p>}
        </>}
        <Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Create member"}</Button>
      </form></section>
  </div>;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Users, UserPlus, UserCheck } from "lucide-react";
import { getActor, IdentityError } from "@/lib/identity";
import { reportOverview, reportAttendance } from "@/lib/reports";
import { DAY, reportQuerySchema } from "@/lib/reports-schema";
import { dayStart } from "@/lib/attendance-schema";
import { formatPhp } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportTabs, ExportAttendance } from "@/components/report-controls";
import styles from "./reports.module.css";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const percent = (count: number, total: number) => `${total ? (count / total * 100).toFixed(1).replace(/\.0$/, "") : "0"}%`;
const color = (index: number) => `var(--chart-${index % 5 + 1})`;

function Members({ data }: { data: Awaited<ReturnType<typeof reportOverview>>["members"] }) {
  return <div className="grid gap-5 xl:grid-cols-[5fr_7fr]">
    <Card><CardHeader><CardTitle><h2>Member Insights</h2></CardTitle><CardDescription>Your membership community right now</CardDescription></CardHeader><CardContent>
      <dl className="grid grid-cols-2 gap-3">{[
        { title: "Total members", value: data.total, detail: "All registered profiles", icon: Users },
        { title: "New this month", value: data.newMembers, detail: "Registrations this month", icon: UserPlus },
        { title: "Expiring soon", value: data.expiring, detail: "Access ends within 7 days", icon: CalendarClock },
        { title: "Active members", value: data.active, detail: "Currently eligible for entry", icon: UserCheck },
      ].map(({ title, value, detail, icon: Icon }) => <div key={title} className="rounded-lg bg-muted/60 p-3 sm:p-4">
        <dt className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{title}</dt>
        <dd className="mt-3"><span className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-PH")}</span><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></dd>
      </div>)}</dl>
      <p className="mt-5 border-t border-border pt-4 text-sm"><strong>{percent(data.active, data.total)}</strong> of registered members have current access.</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Total includes pending registrations. Expiring soon accounts for adjacent paid renewals.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>Members by Plan</h2></CardTitle><CardDescription>Current active members, grouped by their effective plan</CardDescription></CardHeader><CardContent>
      {!data.active && <p className="mb-4 text-sm text-muted-foreground">No active memberships yet.</p>}
      <ul className="space-y-6">{data.plans.map((plan, i) => <li key={plan.id}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="break-words font-medium">{plan.name}</span><span className="shrink-0 tabular-nums"><strong>{plan.count}</strong><span className="ml-2 text-muted-foreground">{percent(plan.count, data.active)}</span></span></div><div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: percent(plan.count, data.active), background: color(i) }} /></div></li>)}</ul>
      {!data.plans.length && <p className="text-sm text-muted-foreground">Plans will appear after your catalogue is configured.</p>}
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Each member counts once. Scheduled future plans are excluded. Retained access without a paid plan is labelled Historical access.</p>
    </CardContent></Card>
  </div>;
}

function Revenue({ data }: { data: Awaited<ReturnType<typeof reportOverview>>["revenue"] }) {
  const delta = data.current - data.previous, maximum = Math.max(data.current, data.previous, 1);
  return <>
    <Card><CardHeader><CardTitle><h2>Revenue Overview</h2></CardTitle><CardDescription>Confirmed collections · month to date</CardDescription></CardHeader><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Collected this month</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatPhp(data.current)}</p></div>
        <p className="rounded-md bg-muted px-3 py-2 text-xs tabular-nums">{delta > 0 ? "+" : ""}{formatPhp(delta)} · {data.previous ? `${delta > 0 ? "+" : ""}${(delta / data.previous * 100).toFixed(1)}%` : "No previous baseline"}</p></div>
      <figure className="mt-6" aria-label="Current and previous month collections comparison">
        <div className={styles.comparison}>{[
          { label: "Previous month", amount: data.previous, from: data.previousStart, to: data.previousEnd },
          { label: "Current month", amount: data.current, from: data.start, to: null },
        ].map((item, i) => <div key={item.label} className={styles.comparisonColumn}><p className="text-sm font-semibold tabular-nums">{formatPhp(item.amount)}</p><div className={styles.barSpace} aria-hidden="true"><div style={{ height: `${item.amount / maximum * 100}%`, background: color(i + 1) }} /></div><p className="mt-3 text-sm font-medium">{item.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{date.format(item.from)} – {item.to ? date.format(new Date(item.to.getTime() - 1)) : "now"}</p></div>)}</div>
        <figcaption className="mt-5 text-xs leading-relaxed text-muted-foreground">Compared at the same elapsed point in each month; capped at the previous month’s end. Gross confirmed collections by collection date, including Cash and Online. Expenses and historical refunds are not deducted.</figcaption>
      </figure>
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>Revenue Mix</h2></CardTitle><CardDescription>What your collections came from · this month to date</CardDescription></CardHeader><CardContent>
      {data.current > 0 && <div aria-hidden="true" className="mb-6 flex h-3 overflow-hidden rounded-full bg-muted">{data.mix.map((item, i) => <div key={item.id} style={{ width: `${item.amount / data.current * 100}%`, background: color(i) }} />)}</div>}
      <ul className="space-y-5">{data.mix.map((item, i) => <li key={item.id} className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: color(i) }} /><div><p className="break-words text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.count} {item.count === 1 ? "payment" : "payments"}</p></div></div><div className="shrink-0 text-right tabular-nums"><p className="text-sm font-semibold">{formatPhp(item.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{percent(item.amount, data.current)}</p></div></li>)}</ul>
      {!data.mix.length && <p className="text-sm text-muted-foreground">No confirmed collections this month yet.</p>}
      <p className="mt-6 text-xs text-muted-foreground">Uses the plan recorded on each payment. Later price changes do not rewrite these amounts.</p>
    </CardContent></Card>
  </>;
}

function Attendance({ data }: { data: Awaited<ReturnType<typeof reportAttendance>> }) {
  const maximum = Math.max(...data.days.map(day => day.count ?? 0), 1);
  function pageHref(page: number) { return `/reports?${new URLSearchParams({ tab: "attendance", week: data.week, from: data.from, to: data.to, page: String(page) })}`; }
  return <>
    <Card><CardHeader><CardTitle><h2>Weekly Attendance</h2></CardTitle><CardDescription>Daily visits · Monday–Sunday · Asia/Manila</CardDescription></CardHeader><CardContent>
      <form action="/reports" className="flex flex-wrap items-end gap-3"><input type="hidden" name="tab" value="attendance" /><input type="hidden" name="from" value={data.from} /><input type="hidden" name="to" value={data.to} /><div><label htmlFor="report-week" className="mb-2 block text-xs font-medium">Week containing</label><Input id="report-week" name="week" type="date" defaultValue={data.week} required /></div><Button variant="outline" type="submit">View week</Button></form>
      <p className="mt-4 text-sm font-medium">{date.format(data.weekStart)} – {date.format(new Date(data.weekEnd.getTime() - DAY))}</p>
      <figure className="mt-5" aria-label="Daily visits in the selected week"><div className={styles.weekChart}>{data.days.map(day => <div key={day.date} className={styles.weekColumn}><span className="text-xs font-semibold tabular-nums">{day.count ?? "—"}</span><div className={styles.weekBarSpace} aria-hidden="true"><div style={{ height: `${(day.count ?? 0) / maximum * 100}%`, background: color(1) }} /></div><span className="mt-2 text-xs font-medium">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" }).format(dayStart(day.date))}</span><span className="sr-only">{day.date}: {day.count === null ? "Future day" : `${day.count} visits`}</span></div>)}</div><figcaption className="mt-4 text-xs leading-relaxed text-muted-foreground">Each arrival counts as one visit, including repeat visits by the same member. Voided visits are excluded. Future days have no values.</figcaption></figure>
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>Daily Visit Log</h2></CardTitle><CardDescription>One row per visit · dates and times in Asia/Manila</CardDescription></CardHeader><CardContent>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><form action="/reports" className="flex flex-wrap items-end gap-3"><input type="hidden" name="tab" value="attendance" /><input type="hidden" name="week" value={data.week} />{["from", "to"].map(key => <div key={key}><label htmlFor={`report-${key}`} className="mb-2 block text-xs font-medium">{key === "from" ? "From" : "To"}</label><Input id={`report-${key}`} type="date" name={key} defaultValue={key === "from" ? data.from : data.to} required /></div>)}<Button variant="outline" type="submit">Apply dates</Button></form><ExportAttendance from={data.from} to={data.to} /></div>
      <p className="mb-3 text-xs text-muted-foreground">{data.count.toLocaleString("en-PH")} {data.count === 1 ? "visit" : "visits"} · CSV opens in Google Sheets. Export includes every visit in the selected range, across all pages.</p>
      <div className="rounded-md border border-border"><Table aria-label="Attendance visit log">
        <caption className="sr-only">Attendance log, Asia/Manila dates and times</caption>
        <TableHeader><TableRow>{["Date", "Member ID", "Name", "Time in", "Notes"].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.visits.map(row => <TableRow key={row.id}>
          <TableCell className="whitespace-nowrap">{date.format(row.arrivedAt)}</TableCell>
          <TableCell className="text-xs"><span className="block max-w-40 break-all whitespace-normal">{row.memberId}</span></TableCell>
          <TableCell className="min-w-36 whitespace-normal [overflow-wrap:anywhere]">{row.name}</TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{time.format(row.arrivedAt)}</TableCell>
          <TableCell className="min-w-36 whitespace-normal">{row.notes}</TableCell>
        </TableRow>)}{!data.visits.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No visits in this date range.</TableCell></TableRow>}</TableBody>
      </Table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>Page {data.page} of {data.pages} · 20 rows per page</p><nav aria-label="Visit log pages" className="flex gap-2">{data.page > 1 && <Link className="action-link secondary" href={pageHref(data.page - 1)}>Previous</Link>}{data.page < data.pages && <Link className="action-link secondary" href={pageHref(data.page + 1)}>Next</Link>}</nav></div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Voided visits are excluded. Notes show visit status and whether a visit was corrected. Choose up to 366 days; exports support up to 50,000 visits.</p>
    </CardContent></Card>
  </>;
}

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  if (actor.operator.role !== "OWNER") return <div role="alert"><h1 className="text-xl font-semibold">Reports are available to the gym owner.</h1><Link href="/settings" className="text-link mt-4 inline-flex min-h-11 items-center">Return to Settings</Link></div>;
  const input = await searchParams, parsed = reportQuerySchema.safeParse(input);
  let overview: Awaited<ReturnType<typeof reportOverview>> | undefined;
  let attendance: Awaited<ReturnType<typeof reportAttendance>> | undefined;
  let errorMessage: string | undefined;
  if (parsed.success) try {
    if (parsed.data.tab === "attendance") attendance = await reportAttendance(requestHeaders, input);
    else overview = await reportOverview(requestHeaders);
  } catch (error) { errorMessage = error instanceof IdentityError ? error.message : "Reports could not be loaded. Try again."; }
  const checkedAt = overview?.checkedAt ?? attendance?.checkedAt;
  const content = !parsed.success ? <p role="alert">Check the report tab, dates and page. <Link href="/reports" className="text-link">Reset filters</Link></p>
    : errorMessage ? <div role="alert" className="rounded-lg border border-border p-5"><p>{errorMessage}</p><Link href="/reports" className="text-link mt-3 inline-flex min-h-11 items-center">Reload reports</Link></div>
    : attendance ? <Attendance data={attendance} />
    : overview && (parsed.data.tab === "members" ? <Members data={overview.members} /> : <Revenue data={overview.revenue} />);
  return <><div className="page-heading"><div><h1>Reports</h1><p>Your members, confirmed collections and recorded visits.</p></div></div><ReportTabs value={parsed.success ? parsed.data.tab : "members"}>{content}</ReportTabs>{checkedAt && <p className="mt-5 text-xs text-muted-foreground">As of {date.format(checkedAt)} at {time.format(checkedAt)} PHT. Reload for the latest records.</p>}</>;
}

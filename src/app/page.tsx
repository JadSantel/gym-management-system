import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor, IdentityError } from "@/lib/identity";
import { workspaceOverview } from "@/lib/workspace";
import { formatPhp } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { PaymentRecords } from "@/components/payment-records";
export const dynamic = "force-dynamic";
export default async function Home() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  if (actor.operator.role !== "OWNER") {
    if (actor.operator.canManageMembers) redirect("/operate");
    redirect("/team");
  }
  const data = await workspaceOverview(requestHeaders);
  const today = data.days.at(-1)!;
  const maximum = Math.max(...data.days.map(day => day.amount), 1);
  const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  return <>
    <div className="page-heading"><div><h1>Welcome, {actor.operator.user.name}.</h1><p>Here&apos;s what needs attention at your gym today.</p></div><Link href="/operate" className="action-link"><WorkspaceIcon name="operate" />Open front desk</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { title: "Gross collections today", value: formatPhp(today.amount), detail: `${today.count} confirmed payments`, icon: "wallet" as const },
      { title: "Active members", value: data.activeMembers, detail: "Currently eligible members", icon: "members" as const },
      { title: "Pending verification", value: data.pending, detail: "Requires actual funds check", icon: "clock" as const },
      { title: "Exception cases", value: data.caseCount, detail: "Preserved investigation records", icon: "alert" as const },
    ].map(stat => <Card key={stat.title} className="gap-0 rounded-lg py-5 shadow-none"><CardContent className="px-5"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{stat.title}</span><span className="rounded-md bg-muted p-1.5"><WorkspaceIcon name={stat.icon} className="size-4" /></span></div><p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{stat.value}</p><p className="mt-2 text-xs text-muted-foreground">{stat.detail}</p></CardContent></Card>)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <section className="panel" aria-labelledby="attention-title"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="attention-title" className="panel-title">Needs your attention</h2><Link className="text-link" href="/investigations">View cases</Link></div>
        {data.pending > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-border py-4"><span className="size-2 bg-attention" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Digital payments awaiting verification</h3><p className="mt-1 text-xs text-muted-foreground">Confirm actual receipt in the designated account.</p></div><Link className="action-link secondary" href="/digital">Review</Link></div>}
        {data.cases.map(record => <div key={record.id} className="flex flex-wrap items-center gap-3 border-b border-border py-4 last:border-0"><span className="size-2 bg-attention" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{record.summary}</h3><p className="mt-1 text-xs text-muted-foreground">Investigation opened {date.format(record.openedAt)}</p></div><Link className="action-link secondary" href={`/investigations/${record.id}`}>Open<span className="sr-only"> case {record.id}</span></Link></div>)}
        {!data.pending && !data.cases.length && <p className="py-10 text-center text-sm text-muted-foreground">No pending transfers or investigation cases recorded.</p>}
        {data.cases.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Recent cases retain their evidence and decisions. Open a case to review its current outcome.</p>}
      </section>
      <section className="panel" aria-labelledby="collections-title"><h2 id="collections-title" className="panel-title">Collections &middot; last 7 days</h2><figure className="mt-5"><div className="flex h-44 items-end gap-3" aria-hidden="true">{data.days.map((day, index) => <div key={day.date.toISOString()} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className={`w-full max-w-10 rounded-t-sm ${index === 6 ? "bg-brand" : "bg-chart"}`} style={{ height: `${day.amount ? Math.max(3, day.amount / maximum * 130) : 0}px` }} /><span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" }).format(day.date)}</span></div>)}</div><figcaption className="mt-5 text-xs leading-relaxed text-muted-foreground">Original confirmed gross collections. Adjustments and refunds remain in daily closing.</figcaption><details className="mt-3 text-xs"><summary className="min-h-8 cursor-pointer text-muted-foreground">View daily amounts</summary><dl className="space-y-2 pt-2">{data.days.map(day => <div className="flex justify-between gap-4" key={day.date.toISOString()}><dt>{date.format(day.date)}</dt><dd>{formatPhp(day.amount)}</dd></div>)}</dl></details></figure></section>
    </div>
    <section className="panel mt-4" aria-labelledby="recent-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-title" className="panel-title">Recent transactions</h2><Link href="/transactions" className="text-link">View transactions</Link></div><PaymentRecords payments={data.payments} /></section>
    <p className="mt-5 text-xs text-muted-foreground">Checked {date.format(data.checkedAt)} PHT. Overview figures reflect recorded data; daily closing retains differences and actual-funds evidence.</p>
  </>;
}

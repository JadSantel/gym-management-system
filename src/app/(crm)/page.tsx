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
    if (actor.operator.canManageMembers) redirect("/members");
    redirect("/team");
  }
  const data = await workspaceOverview(requestHeaders);
  const today = data.days.at(-1)!;
  const maximum = Math.max(...data.days.map(day => day.amount), 1);
  const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  return <>
    <div className="page-heading"><div><h1>Welcome, {actor.operator.user.name}.</h1><p>Check membership, record a full payment, or retrieve payment history.</p></div><Link href="/members#search-name" className="action-link"><WorkspaceIcon name="search" />Find a member</Link></div>
    <div className="grid gap-3 sm:grid-cols-2">{[
      { title: "Cash collected today", value: formatPhp(today.amount), detail: `${today.count} recorded cash payments`, icon: "wallet" as const },
      { title: "Active members", value: data.activeMembers, detail: "Currently eligible members", icon: "members" as const },
    ].map(stat => <Card key={stat.title} className="gap-0 rounded-lg py-5 shadow-none"><CardContent className="px-5"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{stat.title}</span><span className="rounded-md bg-muted p-1.5"><WorkspaceIcon name={stat.icon} className="size-4" /></span></div><p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{stat.value}</p><p className="mt-2 text-xs text-muted-foreground">{stat.detail}</p></CardContent></Card>)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <section className="panel" aria-labelledby="workflow-title"><h2 id="workflow-title" className="panel-title">Payment collection</h2><p className="mt-4 text-sm leading-relaxed">Record full Cash or Online payments (GCash, GoTyme, MariBank), retrieve receipts and check current membership eligibility. Verify Online funds in the gym&apos;s receiving account before confirming. Exceptions, outage receipts and daily closing remain retired.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Existing records from retired workflows remain preserved and read-only in relevant member and payment history. No emergency process outside the CRM is defined here.</p><Link className="mt-5 inline-flex text-sm font-semibold underline" href="/transactions">Open payment history</Link></section>
      <section className="panel" aria-labelledby="collections-title"><h2 id="collections-title" className="panel-title">Cash collections &middot; last 7 days</h2><figure className="mt-5"><div className="flex h-44 items-end gap-3" aria-hidden="true">{data.days.map((day, index) => <div key={day.date.toISOString()} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className={`w-full max-w-10 rounded-t-sm ${index === 6 ? "bg-brand" : "bg-chart"}`} style={{ height: `${day.amount ? Math.max(3, day.amount / maximum * 130) : 0}px` }} /><span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" }).format(day.date)}</span></div>)}</div><figcaption className="mt-5 text-xs leading-relaxed text-muted-foreground">Recorded cash collections. In-app daily closing is retired.</figcaption><details className="mt-3 text-xs"><summary className="min-h-8 cursor-pointer text-muted-foreground">View daily amounts</summary><dl className="space-y-2 pt-2">{data.days.map(day => <div className="flex justify-between gap-4" key={day.date.toISOString()}><dt>{date.format(day.date)}</dt><dd>{formatPhp(day.amount)}</dd></div>)}</dl></details></figure></section>
    </div>
    <section className="panel mt-4" aria-labelledby="recent-title"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-title" className="panel-title">Recent transactions</h2><Link href="/transactions" className="text-link">View transactions</Link></div><PaymentRecords payments={data.payments} /></section>
    <p className="mt-5 text-xs text-muted-foreground">Checked {date.format(data.checkedAt)} PHT. Earlier payments retain their recorded method in read-only history.</p>
  </>;
}

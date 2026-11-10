import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor, IdentityError } from "@/lib/identity";
import { workspaceOverview } from "@/lib/workspace";
import { formatPhp } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { PaymentRecords } from "@/components/payment-records";
import { DashboardCollections } from "@/components/dashboard-collections";
import { DashboardError, DashboardLoading } from "@/components/dashboard-states";

export const dynamic = "force-dynamic";
const checkedTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

async function DailySnapshot({ requestHeaders }: { requestHeaders: Headers }) {
  let data;
  try { data = await workspaceOverview(requestHeaders); }
  catch (error) {
    if (error instanceof IdentityError) redirect("/login");
    return <DashboardError />;
  }
  const today = data.days.at(-1)!;
  return <>
    <div id="dashboard-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Today's gym snapshot" role="region">
      <Card className="col-span-2 gap-0 rounded-lg py-4 shadow-none sm:col-span-1"><CardContent className="px-4">
        <h2 className="text-xs font-medium text-muted-foreground">Confirmed payments today</h2>
        <p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{formatPhp(today.amount)}</p>
        <p className="mt-2 text-xs text-muted-foreground">{today.count} full {today.count === 1 ? "payment" : "payments"} recorded</p>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs tabular-nums">
          <div><dt className="mr-1 inline text-muted-foreground">Cash</dt><dd className="inline font-medium">{formatPhp(today.cash)}</dd></div>
          <div><dt className="mr-1 inline text-muted-foreground">Online</dt><dd className="inline font-medium">{formatPhp(today.online)}</dd></div>
        </dl>
      </CardContent></Card>
      <Card className="gap-0 rounded-lg py-4 shadow-none"><CardContent className="px-4">
        <h2 className="text-xs font-medium text-muted-foreground">Currently eligible</h2>
        <p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{data.activeMembers}</p>
        <p className="mt-2 text-xs text-muted-foreground">Current verified access</p>
      </CardContent></Card>
      <Card className="gap-0 rounded-lg py-4 shadow-none"><CardContent className="px-4">
        <h2 className="text-xs font-medium text-muted-foreground">Currently inside</h2>
        <p className="mt-3 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{data.attendance.inside}</p>
        <p className="mt-2 text-xs text-muted-foreground">{data.attendance.checkedIn} {data.attendance.checkedIn === 1 ? "check-in" : "check-ins"} today</p>
      </CardContent></Card>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Snapshot as of <time dateTime={data.checkedAt.toISOString()}>{checkedTime.format(data.checkedAt)} PHT</time>. Reload for the latest records.</p>
    <DashboardCollections days={data.days} />
    <section id="recent-payments" className="panel mt-4" aria-labelledby="recent-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="recent-title" className="panel-title">Recent payments</h2><p className="mt-1 text-xs text-muted-foreground">Latest confirmed collections</p></div><Link href="/transactions" className="text-link inline-flex min-h-11 items-center">View all payments<WorkspaceIcon name="arrow" className="ml-2 size-3" /></Link></div>
      <PaymentRecords payments={data.payments} />
    </section>
  </>;
}

export default async function Home() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  if (actor.operator.role !== "OWNER") {
    if (actor.operator.canManageMembers) redirect("/members");
    redirect("/team");
  }
  return <>
    <div className="page-heading"><div><h1>Welcome, {actor.operator.user.name}.</h1><p>Your gym today. Confirmed collections, current access and attendance.</p></div>
      <nav id="dashboard-actions" aria-label="Common gym work" className="flex flex-wrap gap-2">
        <Link href="/members#search-name" aria-label="Record payment" className="action-link"><WorkspaceIcon name="wallet" />Record payment</Link>
        <Link href="/members#search-name" aria-label="Find a member" className="action-link secondary"><WorkspaceIcon name="search" />Find a member</Link>
        <Link href="/attendance/scanner" aria-label="Open scanner" className="action-link secondary"><WorkspaceIcon name="scanner" />Open scanner</Link>
      </nav>
    </div>
    <Suspense fallback={<DashboardLoading />}><DailySnapshot requestHeaders={requestHeaders} /></Suspense>
  </>;
}

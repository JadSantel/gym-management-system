"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return <section aria-label="Loading dashboard" aria-busy="true">
    <p role="status" className="mb-4 text-sm text-muted-foreground">Loading today&apos;s snapshot…</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map(index => <Skeleton key={index} className={`h-36 rounded-lg ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`} />)}</div>
    <Skeleton className="mt-4 h-80 rounded-lg" /><Skeleton className="mt-4 h-64 rounded-lg" />
  </section>;
}

export function DashboardError() {
  const router = useRouter();
  return <section role="alert" className="panel">
    <h2 className="text-lg font-semibold">Dashboard could not be loaded</h2>
    <p className="my-4 text-sm text-muted-foreground">Today&apos;s totals are unavailable. Retry to load confirmed payments, eligibility and attendance.</p>
    <Button onClick={() => router.refresh()}>Retry dashboard</Button>
  </section>;
}

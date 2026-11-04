import { Skeleton } from "@/components/ui/skeleton";
export default function AttendanceLoading() {
  return <section aria-label="Loading attendance" aria-busy="true"><p role="status" className="mb-5 text-sm text-muted-foreground">Loading attendance…</p><div className="mb-5 grid grid-cols-3 gap-3">{[0, 1, 2].map(item => <Skeleton key={item} className="h-28 rounded-lg" />)}</div><Skeleton className="mb-7 h-72 rounded-lg" /><Skeleton className="h-96 rounded-lg" /></section>;
}

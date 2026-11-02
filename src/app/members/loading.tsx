import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return <section aria-label="Loading members" aria-busy="true"><p role="status" className="mb-5 text-sm text-muted-foreground">Loading members…</p><div className="mb-6 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(item => <Skeleton key={item} className="h-36 rounded-lg" />)}</div><Skeleton className="h-96 rounded-lg" /></section>;
}

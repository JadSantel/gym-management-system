import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingReports() {
  return <div role="status" aria-label="Loading reports" className="space-y-5"><p className="text-sm text-muted-foreground">Loading reports…</p><Skeleton className="h-12 w-64" /><Skeleton className="h-80 w-full" /></div>;
}

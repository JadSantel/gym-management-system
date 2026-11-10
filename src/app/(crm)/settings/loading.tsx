import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return <section role="status" aria-label="Loading settings" className="space-y-5"><span className="sr-only">Loading settings…</span><Skeleton className="h-8 w-40" /><Skeleton className="h-28 w-full rounded-xl" /><div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-24 rounded-xl" />)}</div></section>;
}

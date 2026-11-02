import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/components/payment-activity.module.css";

export default function PaymentHistoryLoading() {
  return <section className={styles.screen} aria-label="Loading payment history" aria-busy="true"><p role="status" className="mb-5 text-sm text-muted-foreground">Loading payment history…</p><div className={`${styles.summary} mb-7`}>{[0, 1, 2, 3].map(item => <Skeleton key={item} className="h-40 rounded-lg" />)}</div><Skeleton className="h-96 rounded-lg" /></section>;
}

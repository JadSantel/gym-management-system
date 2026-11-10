import { formatPhp } from "@/lib/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import styles from "./dashboard.module.css";

type Day = { date: Date; cash: number; online: number; amount: number; count: number };
const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

export function DashboardCollections({ days }: { days: Day[] }) {
  const maximum = Math.max(...days.flatMap(day => [day.cash, day.online]), 100);
  const cash = days.reduce((sum, day) => sum + day.cash, 0), online = days.reduce((sum, day) => sum + day.online, 0);
  return <section className="panel mt-4" aria-labelledby="collections-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="collections-title" className="panel-title">Collections · last 7 days</h2><p className="mt-1 text-xs text-muted-foreground">{date.format(days[0].date)} – {date.format(days.at(-1)!.date)} · Asia/Manila</p></div>
      <div><p className="text-xs text-muted-foreground">Seven-day total</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatPhp(cash + online)}</p></div>
    </div>
    <figure className="mt-5" aria-labelledby="collections-title" aria-describedby="collections-caption">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs" aria-label="Collection methods">
        <li className="flex items-center gap-2"><span aria-hidden="true" className={`${styles.swatch} ${styles.cash}`} />Cash (left) <strong className="font-medium">{formatPhp(cash)}</strong></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className={`${styles.swatch} ${styles.online}`} />Online (right) <strong className="font-medium">{formatPhp(online)}</strong></li>
      </ul>
      <div className={styles.chart} aria-hidden="true">
        <div className={styles.scale}><span>{formatPhp(maximum)}</span><span>{formatPhp(Math.floor(maximum / 2))}</span><span>₱0</span></div>
        <div className={styles.plot}>{days.map(day => <div key={day.date.toISOString()} className={styles.day}>
          <div className={styles.bars}>
            <div className={styles.cash} style={{ height: `${day.cash / maximum * 100}%` }} />
            <div className={styles.online} style={{ height: `${day.online / maximum * 100}%` }} />
          </div>
          <span>{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", day: "numeric" }).format(day.date)}</span>
        </div>)}</div>
      </div>
      <figcaption id="collections-caption" className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {cash + online === 0 ? "No confirmed payments in these seven days. " : ""}Full confirmed payments by collection date. Online includes GCash and bank transfers. Daily amounts are available below.
      </figcaption>
      <details id="collection-details" className="mt-3 border-t border-border pt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium hover:underline">View daily amounts</summary>
        <Table className="text-xs tabular-nums"><caption className="sr-only">Daily confirmed collections in PHP, Asia/Manila dates</caption>
          <TableHeader><TableRow>{["Date (PHT)", "Cash", "Online", "Total"].map(label => <TableHead key={label} scope="col" className="text-xs">{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{days.map(day => <TableRow key={day.date.toISOString()}><TableHead scope="row" className="whitespace-nowrap text-xs">{date.format(day.date)}</TableHead><TableCell>{formatPhp(day.cash)}</TableCell><TableCell>{formatPhp(day.online)}</TableCell><TableCell className="font-semibold">{formatPhp(day.amount)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </details>
    </figure>
  </section>;
}

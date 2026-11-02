"use client";

import { useEffect, useState } from "react";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric",
});

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  return <div role="timer" className="w-32 shrink-0 text-right leading-tight sm:w-40" aria-label="Current time in Asia/Manila">
    <div className="whitespace-nowrap text-xs font-semibold tabular-nums sm:text-[13px]">
      <time dateTime={now?.toISOString()}>{now ? timeFormat.format(now) : "--:--:--"}</time>
      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground" title="Philippine Time (UTC+8)">PHT</span>
    </div>
    <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground sm:text-xs">{now ? dateFormat.format(now) : "Manila time"}</p>
  </div>;
}

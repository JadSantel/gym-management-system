export type PaidInterval = { startsAt: Date; endsAt: Date };

export function remainingActiveTime(interval: PaidInterval, now: Date) {
  if (now < interval.startsAt || now >= interval.endsAt) return null;
  const totalHours = Math.floor((interval.endsAt.getTime() - now.getTime()) / 3_600_000);
  if (totalHours === 0) return "less than 1 hour";
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function assessEligibility(intervals: PaidInterval[], now: Date) {
  const ordered = [...intervals].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const current = ordered.find(interval => interval.startsAt <= now && now < interval.endsAt);
  if (current) return { status: "ELIGIBLE" as const, interval: current, reason: "A verified paid period is in effect." };
  const future = ordered.find(interval => interval.startsAt > now);
  if (future) return { status: "SCHEDULED" as const, interval: future, reason: "A paid period is scheduled; it has not started." };
  const latest = ordered.at(-1);
  if (latest) return { status: "EXPIRED" as const, interval: latest, reason: "The most recent verified paid period has expired." };
  return { status: "NOT_ELIGIBLE" as const, interval: null, reason: "No verified paid period is recorded." };
}

export type PaidInterval = { startsAt: Date; endsAt: Date };

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

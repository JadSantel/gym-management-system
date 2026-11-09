import type { PaidInterval } from "./eligibility";

export function membershipProgress(interval: PaidInterval, checkedAt: Date) {
  const duration = interval.endsAt.getTime() - interval.startsAt.getTime();
  const elapsed = Math.max(0, Math.min(duration, checkedAt.getTime() - interval.startsAt.getTime()));
  return { percent: duration > 0 ? elapsed / duration * 100 : 0, usedDays: Math.floor(elapsed / 86_400_000), daysLeft: Math.floor((duration - elapsed) / 86_400_000) };
}

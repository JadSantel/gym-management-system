import { dayStart, manilaDay } from "./attendance-schema";

type Visit = { arrivedAt: Date; departedAt: Date | null };

// Input is the tenant's nonvoided visits overlapping today, through the read time.
export function summarizeAttendance(visits: Visit[], now: Date) {
  const today = manilaDay(now), start = dayStart(today).getTime(), time = now.getTime();
  const intervals = visits.filter(visit => visit.arrivedAt.getTime() <= time).map(visit => ({
    start: visit.arrivedAt.getTime(),
    // Unrecorded departures stop contributing at their arrival day's midnight.
    end: visit.departedAt?.getTime() ?? dayStart(manilaDay(new Date(visit.arrivedAt.getTime() + 86_400_000))).getTime(),
    departedAt: visit.departedAt?.getTime() ?? null,
  }));
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const from = start + hour * 3_600_000, to = from + 3_600_000;
    if (from > time) return { hour, occupancy: null };
    const events: { at: number; change: number }[] = [];
    for (const visit of intervals) {
      if (visit.start < to && visit.end > from) {
        events.push({ at: Math.max(from, visit.start), change: 1 }, { at: Math.min(to, visit.end), change: -1 });
      }
    }
    // Departures precede arrivals at the same instant: intervals are [in, out).
    events.sort((a, b) => a.at - b.at || a.change - b.change);
    let inside = 0, peak = 0;
    for (const event of events) {
      if (event.at > time) break;
      inside += event.change;
      peak = Math.max(peak, inside);
    }
    return { hour, occupancy: peak };
  });
  return {
    today,
    checkedIn: intervals.filter(visit => visit.start >= start).length,
    inside: intervals.filter(visit => visit.start <= time && visit.end > time).length,
    checkedOut: intervals.filter(visit => visit.departedAt !== null && visit.departedAt >= start && visit.departedAt <= time).length,
    hours,
  };
}

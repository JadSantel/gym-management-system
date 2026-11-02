import { assessEligibility } from "./eligibility";

export type DirectoryMember = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hasVerifiedMembership: boolean;
  entitlements: { startsAt: string; endsAt: string; legacyRecordId: string | null }[];
};

export function directoryMembership(member: DirectoryMember, checkedAt: string) {
  const now = new Date(checkedAt);
  const eligibility = assessEligibility(member.entitlements.map(interval => ({
    ...interval, startsAt: new Date(interval.startsAt), endsAt: new Date(interval.endsAt),
  })), now);
  const active = eligibility.status === "ELIGIBLE";
  const expiringSoon = active && eligibility.interval.endsAt.getTime() - now.getTime() <= 7 * 86_400_000;
  const pending = eligibility.status === "NOT_ELIGIBLE" && !member.hasVerifiedMembership;
  return { ...eligibility, active, expiringSoon, pending,
    label: expiringSoon ? "Expiring soon" : active ? "Active" : eligibility.status === "SCHEDULED" ? "Scheduled" : eligibility.status === "EXPIRED" ? "Expired" : pending ? "Pending" : "No current membership" };
}

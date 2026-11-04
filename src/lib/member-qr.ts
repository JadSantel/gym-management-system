import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { assessEligibility } from "./eligibility";
import { IdentityError } from "./identity";

// Caller holds the member row lock in the same tenant transaction.
export async function issueMemberQr(tx: Prisma.TransactionClient, actor: { id: string; gymId: string; userId: string }, memberId: string, now: Date, replace = false) {
  const eligibility = assessEligibility(await tx.effectiveEntitlement.findMany({ where: { memberId, isCurrentProjection: true } }), now);
  if (eligibility.status !== "ELIGIBLE") throw new IdentityError(409, "Current verified membership is required to issue or replace a personal QR. No payment is needed for an already eligible member.");
  const current = await tx.memberQr.findFirst({ where: { memberId, revokedAt: null } });
  if (current && !replace) return current;
  if (current) await tx.memberQr.update({ where: { id: current.id }, data: { revokedAt: now } });
  const qr = await tx.memberQr.create({ data: { gymId: actor.gymId, memberId, code: randomBytes(32).toString("base64url"), createdBy: actor.id, createdAt: now } });
  await tx.identityAudit.create({ data: { gymId: actor.gymId, initiatorId: actor.userId, subjectId: memberId, action: replace ? "MEMBER_QR_REPLACED" : "MEMBER_QR_ISSUED" } });
  return qr;
}

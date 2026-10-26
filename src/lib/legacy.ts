import { createHash } from "node:crypto";
import { z } from "zod";
import { inGym, authorize } from "./tenant";
import { IdentityError, ownerInTransaction } from "./identity";
import { legacyCommandSchema, legacyInterval } from "./legacy-schema";

export class LegacyRejected extends IdentityError {}
function reject(status: number, message: string): never { throw new LegacyRejected(status, message); }
export async function legacyCommand(headers: Headers, input: unknown, key: unknown) {
  const parsed = legacyCommandSchema.safeParse(input); const parsedKey = z.uuid().safeParse(key);
  if (!parsed.success || !parsedKey.success) reject(400, "Check the legacy fields and operation key.");
  const command = parsed.data!; const operationKey = parsedKey.data!;
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const result = await inGym(headers, "MEMBERS", async (tx, actor) => {
    const gymId = actor.operator.gymId;
    if (command.action === "review") authorize(actor.operator, "OWNER");
    const replay = await tx.legacyRecord.findUnique({ where: { gymId_operationKey: { gymId, operationKey } } });
    if (replay) {
      if (replay.fingerprint !== fingerprint) reject(409, "This key belongs to different legacy details. Retrieve the original operation.");
      return replay;
    }
    if (command.action === "prepare") {
      const member = await tx.member.findUnique({ where: { id: command.memberId } });
      if (!member) reject(404, "Member unavailable.");
      await tx.$queryRaw`SELECT id FROM members WHERE id=${member.id}::uuid AND gym_id=${gymId}::uuid FOR UPDATE`;
      if (command.previousId && !await tx.legacyRecord.findFirst({ where: { id: command.previousId, memberId: member.id } })) reject(404, "Previous evidence unavailable.");
      const interval = legacyInterval(command.interpretation, command.claimedStart, command.claimedEnd);
      if (command.uncertainty === "CERTAIN" && (!interval || interval.startsAt > new Date() || !command.corroboratingReference || command.sourceReference === command.corroboratingReference)) {
        reject(400, "Certain evidence requires two different independent references and an unambiguous interval starting by entry time.");
      }
      return tx.legacyRecord.create({ data: { gymId, memberId: member.id, kind: "PREPARE", previousId: command.previousId,
        sourceReference: command.sourceReference, sourceType: command.sourceType, corroboratingReference: command.corroboratingReference,
        interpretation: command.interpretation, claimedStart: command.claimedStart, claimedEnd: command.claimedEnd,
        ...interval, uncertainty: command.uncertainty, notes: command.notes, actorId: actor.operator.id, operationKey, fingerprint } });
    }
    await ownerInTransaction(tx, actor);
    const proposal = await tx.legacyRecord.findUnique({ where: { id: command.proposalId } });
    if (!proposal || proposal.kind !== "PREPARE") reject(404, "Legacy proposal unavailable.");
    await tx.$queryRaw`SELECT id FROM members WHERE id=${proposal.memberId}::uuid AND gym_id=${gymId}::uuid FOR UPDATE`;
    if (await tx.legacyRecord.findFirst({ where: { proposalId: proposal.id } })) reject(409, "This proposal already has an immutable decision. Link a new proposal for further review.");
    async function blocked(reason: string) {
      // Commit rejection evidence while leaving the proposal undecided and access unchanged.
      // Throw only after this transaction commits; throwing here would erase the audit.
      const action = `LEGACY_APPROVAL_BLOCKED ${operationKey} ${fingerprint} ${reason}`;
      if (!await tx.identityAudit.findFirst({ where: { subjectId: proposal!.id, action } })) {
        await tx.identityAudit.create({ data: { gymId, initiatorId: actor.operator.userId, subjectId: proposal!.id, action } });
      }
      return { blockedReason: reason };
    }
    if (command.decision === "APPROVE") {
      if (proposal.uncertainty !== "CERTAIN" || !proposal.startsAt || !proposal.endsAt || !proposal.corroboratingReference || proposal.startsAt > proposal.createdAt) return blocked("Uncertain legacy evidence cannot grant access. Preserve it for review.");
      const references = [proposal.sourceReference, proposal.corroboratingReference];
      if (await tx.legacyRecord.findFirst({ where: { kind: "APPROVE", OR: [{ sourceReference: { in: references } }, { corroboratingReference: { in: references } }] } })) return blocked("A referenced source item already grants historical access. No duplicate entitlement was created.");
      if (await tx.effectiveEntitlement.findFirst({ where: { memberId: proposal.memberId, isCurrentProjection: true, startsAt: { lt: proposal.endsAt }, endsAt: { gt: proposal.startsAt } } })) return blocked("Historical interval overlaps verified access. Preserve both sources for review; no existing period changed.");
    }
    const decision = await tx.legacyRecord.create({ data: { gymId, memberId: proposal.memberId, sourceReference: proposal.sourceReference,
      sourceType: proposal.sourceType, corroboratingReference: proposal.corroboratingReference, interpretation: proposal.interpretation,
      claimedStart: proposal.claimedStart, claimedEnd: proposal.claimedEnd, startsAt: proposal.startsAt, endsAt: proposal.endsAt,
      uncertainty: proposal.uncertainty, kind: command.decision, proposalId: proposal.id,
      actorId: actor.operator.id, notes: command.notes, operationKey, fingerprint } });
    if (decision.kind === "APPROVE") await tx.effectiveEntitlement.create({ data: { gymId, memberId: decision.memberId,
      legacyRecordId: decision.id, startsAt: decision.startsAt!, endsAt: decision.endsAt! } });
    return decision;
  }, true);
  if ("blockedReason" in result) reject(409, result.blockedReason);
  return result;
}

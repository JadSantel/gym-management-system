import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { contactSchema, memberCreateSchema, memberFieldErrors, memberSearchSchema } from "./member-schema";
import type { Prisma } from "../generated/prisma/client";
import { recordParamsSchema } from "./route-schema";

export async function lockMemberContacts(tx: Prisma.TransactionClient, gymId: string) {
  // ponytail: gym-wide contact writes serialize for the 80–150-member scope; split by contact if contention warrants it.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contacts:${gymId}`}, 0))`;
}
export async function contactExists(tx: Prisma.TransactionClient, email: string | null, phone: string | null, except?: string) {
  return !!(email || phone) && await tx.member.count({ where: { ...(except ? { id: { not: except } } : {}),
    OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } }) > 0;
}

export async function findMembers(headers: Headers, search: unknown) {
  const parsed = memberSearchSchema.safeParse(search);
  if (!parsed.success) throw new IdentityError(400, parsed.error.issues[0].message, { q: parsed.error.issues[0].message });
  return inGym(headers, "MEMBERS", tx => tx.member.findMany({ where: { fullName: { contains: parsed.data, mode: "insensitive" } }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 25,
    include: { entitlements: { where: { isCurrentProjection: true }, select: { startsAt: true, endsAt: true, legacyRecordId: true } } } }));
}

export async function memberDirectory(headers: Headers) {
  return inGym(headers, "MEMBERS", async tx => {
    const checkedAt = new Date().toISOString();
    const members = await tx.member.findMany({
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: { id: true, fullName: true, email: true, phone: true, entitlements: {
        select: { startsAt: true, endsAt: true, legacyRecordId: true, isCurrentProjection: true },
      } },
    });
    return { checkedAt, members: members.map(member => ({ id: member.id, fullName: member.fullName, email: member.email, phone: member.phone,
      hasVerifiedMembership: member.entitlements.length > 0,
      entitlements: member.entitlements.filter(interval => interval.isCurrentProjection).map(interval => ({
        startsAt: interval.startsAt.toISOString(), endsAt: interval.endsAt.toISOString(), legacyRecordId: interval.legacyRecordId,
      })),
    })) };
  });
}
export async function createMember(headers: Headers, input: unknown) {
  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the member fields.", memberFieldErrors(parsed.error));
  const { fullName, confirmDuplicate, email, phone } = parsed.data;
  const name = { fullName, nameKey: fullName.toLowerCase() };
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    await lockMemberContacts(tx, actor.operator.gymId);
    if (await contactExists(tx, email, phone)) throw new IdentityError(409, "Email or phone is already recorded. Review the member records at reception.", { email: "Review the recorded contacts before creating another profile.", phone: "A matching email or phone cannot be used for another member." });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.operator.gymId}:${name.nameKey}`}, 0))`;
    if (!confirmDuplicate && await tx.member.count({ where: { nameKey: name.nameKey } }) > 0) {
      throw new IdentityError(409, "A member with this name exists. Review search results before creating a separate person.");
    }
    const member = await tx.member.create({ data: { ...name, email, phone, gymId: actor.operator.gymId, createdBy: actor.operator.id } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: member.id, action: "MEMBER_CREATED" } });
    return member;
  });
}

export async function updateMemberContacts(headers: Headers, id: unknown, input: unknown) {
  const reference = recordParamsSchema.safeParse({ id });
  const parsed = contactSchema.safeParse(input);
  if (!reference.success || !parsed.success) throw new IdentityError(400, "Check the contact fields.", parsed.success ? {} : memberFieldErrors(parsed.error));
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    await lockMemberContacts(tx, actor.operator.gymId);
    const member = await tx.member.findUnique({ where: { id: reference.data.id } });
    if (!member) throw new IdentityError(404, "Member unavailable.");
    const { email, phone } = parsed.data;
    if (await contactExists(tx, email, phone, member.id)) throw new IdentityError(409, "Email or phone is already recorded. Review the member records at reception.");
    const updated = await tx.member.update({ where: { id: member.id }, data: { email, phone } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: member.id, action: "MEMBER_CONTACTS_UPDATED_UNVERIFIED" } });
    return { email: updated.email, phone: updated.phone };
  });
}

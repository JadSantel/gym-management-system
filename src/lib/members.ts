import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { memberCreateSchema, memberFieldErrors, memberSearchSchema } from "./member-schema";

export async function findMembers(headers: Headers, search: unknown) {
  const parsed = memberSearchSchema.safeParse(search);
  if (!parsed.success) throw new IdentityError(400, parsed.error.issues[0].message, { q: parsed.error.issues[0].message });
  return inGym(headers, "MEMBERS", tx => tx.member.findMany({ where: { fullName: { contains: parsed.data, mode: "insensitive" } }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 25,
    include: { entitlements: { where: { isCurrentProjection: true }, select: { startsAt: true, endsAt: true, legacyRecordId: true } } } }));
}
export async function createMember(headers: Headers, input: unknown) {
  const parsed = memberCreateSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the member fields. Only full name and duplicate confirmation are accepted.", memberFieldErrors(parsed.error));
  const { fullName, confirmDuplicate } = parsed.data;
  const name = { fullName, nameKey: fullName.toLowerCase() };
  return inGym(headers, "MEMBERS", async (tx, actor) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.operator.gymId}:${name.nameKey}`}, 0))`;
    if (!confirmDuplicate && await tx.member.count({ where: { nameKey: name.nameKey } }) > 0) {
      throw new IdentityError(409, "A member with this name exists. Review search results before creating a separate person.");
    }
    const member = await tx.member.create({ data: { ...name, gymId: actor.operator.gymId, createdBy: actor.operator.id } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: member.id, action: "MEMBER_CREATED" } });
    return member;
  });
}

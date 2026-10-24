import { inGym } from "./tenant";
import { IdentityError } from "./identity";

export function memberName(value: string) {
  const fullName = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (fullName.length < 1 || fullName.length > 100 || /[\p{Cc}\p{Cf}]/u.test(fullName)) throw new IdentityError(400, "Enter a member name with 1–100 visible characters.");
  return { fullName, nameKey: fullName.toLowerCase() };
}
export async function findMembers(headers: Headers, search: string) {
  if (search.length > 100) throw new IdentityError(400, "Search must be 100 characters or fewer.");
  return inGym(headers, "MEMBERS", tx => tx.member.findMany({ where: { fullName: { contains: search.trim(), mode: "insensitive" } }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 25 }));
}
export async function createMember(headers: Headers, value: string, confirmDuplicate = false) {
  const name = memberName(value);
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

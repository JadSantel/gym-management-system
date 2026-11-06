import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { db } from "./db";
import { auth } from "./auth";
import { setGymContext } from "./binding";
import { inGym } from "./tenant";
import { IdentityError } from "./identity";
import { assertSynthetic } from "./email";
import { contactExists, lockMemberContacts } from "./members";
import { memberFieldErrors, registrationCodeSchema, registrationSchema } from "./member-schema";

export async function registrationScope(code: unknown) {
  assertSynthetic();
  const parsed = registrationCodeSchema.safeParse(code);
  if (!parsed.success) throw new IdentityError(410, "Registration link unavailable. Please speak to reception.");
  const [scope] = await db.$queryRaw<{ id: string; gym_id: string; name: string }[]>`SELECT * FROM public.registration_scope(${parsed.data})`;
  if (!scope) throw new IdentityError(410, "Registration link unavailable. Please speak to reception.");
  return scope;
}

export async function registrationLink(headers: Headers, replace = false) {
  const config = assertSynthetic();
  const link = await inGym(headers, "MEMBERS", async (tx, actor) => {
    await lockMemberContacts(tx, actor.operator.gymId);
    const current = await tx.registrationLink.findFirst({ where: { revokedAt: null } });
    if (!replace) return current && current.expiresAt > new Date() ? current : null;
    if (current) await tx.registrationLink.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    const next = await tx.registrationLink.create({ data: { gymId: actor.operator.gymId, createdBy: actor.operator.id,
      code: randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: next.id, action: "REGISTRATION_LINK_ISSUED" } });
    return next;
  });
  if (!link) return null;
  const url = `${config.BETTER_AUTH_URL}/join/${link.code}`;
  return { url, expiresAt: link.expiresAt.toISOString(), qr: await QRCode.toDataURL(url, { width: 360, margin: 4, errorCorrectionLevel: "M" }) };
}

export async function registerMember(code: unknown, input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check your registration details.", memberFieldErrors(parsed.error));
  const scope = await registrationScope(code);
  const { fullName, email, phone, password, requestId } = parsed.data;
  // A keyed fingerprint detects changed-password retries without storing a password-guessing oracle.
  const fingerprint = createHmac("sha256", assertSynthetic().BETTER_AUTH_SECRET)
    .update(JSON.stringify({ fullName, email, phone, password })).digest("hex");
  const passwordHash = await (await auth.$context).password.hash(password);
  return db.$transaction(async tx => {
    await setGymContext(tx, scope.gym_id);
    await tx.$queryRaw`SELECT id FROM gyms WHERE id=${scope.gym_id}::uuid FOR SHARE`;
    await lockMemberContacts(tx, scope.gym_id);
    // Recheck after the same lock used by replacement and contact mutations.
    const link = await tx.registrationLink.findUnique({ where: { id: scope.id } });
    const gym = await tx.gym.findUnique({ where: { id: scope.gym_id } });
    if (!link || link.revokedAt || link.expiresAt <= new Date() || gym?.state !== "ACTIVE") throw new IdentityError(410, "Registration link unavailable. Please speak to reception.");
    const previous = await tx.registrationAttempt.findUnique({ where: { linkId_requestId: { linkId: scope.id, requestId } } });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new IdentityError(409, "This submission is already recorded. Please speak to reception.");
      return { status: previous.outcome };
    }
    const duplicate = await contactExists(tx, email, phone);
    const userId = randomUUID();
    // The provider email is globally unique. Never attach a new profile to an existing identity.
    // ON CONFLICT also handles simultaneous signups in different gyms without changing credentials.
    const created = duplicate ? 0 : (await tx.user.createMany({ data: { id: userId, name: fullName, email, emailVerified: false }, skipDuplicates: true })).count;
    const member = created ? await tx.member.create({ data: { gymId: scope.gym_id, fullName, nameKey: fullName.toLowerCase(), email, phone, source: "PUBLIC_REGISTRATION" } }) : null;
    if (member) {
      await tx.account.create({ data: { id: `credential:${userId}`, accountId: userId, providerId: "credential", userId, password: passwordHash } });
      await tx.memberAccount.create({ data: { gymId: scope.gym_id, memberId: member.id, userId, state: "ACTIVE" } });
      await tx.identityAudit.create({ data: { gymId: scope.gym_id, initiatorId: userId, subjectId: userId, action: "MEMBER_REGISTERED_PASSWORD" } });
    }
    const outcome = member ? "PENDING" : "RECEPTION";
    await tx.registrationAttempt.create({ data: { gymId: scope.gym_id, linkId: scope.id, requestId, fingerprint, outcome, memberId: member?.id } });
    return { status: outcome };
  });
}

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { auth } from "./auth";
import { db } from "./db";
import { assertSynthetic, localEmail, type EmailSender } from "./email";
import type { Prisma, PrismaClient, InvitePurpose } from "../generated/prisma/client";
import { identityBinding, setGymContext } from "./binding";

export class IdentityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = () => new IdentityError(403, "Account access is unavailable.");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const invalidLink = () => new IdentityError(400, "Link expired, replaced, or already used. Ask for a new invitation or reset.");

export async function getActor(headers: Headers) {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session) throw new IdentityError(401, "Sign in to continue.");
  const operator = await identityBinding(session.user.id);
  if (!operator || operator.state !== "ACTIVE" || operator.gym.state !== "ACTIVE" || !operator.user.emailVerified) throw fail();
  return { operator, sessionId: session.session.id };
}

export async function ownerInTransaction(tx: Prisma.TransactionClient, actor: Awaited<ReturnType<typeof getActor>>, fresh = true) {
  await setGymContext(tx, actor.operator.gymId);
  // Serialize identity administration per gym and recheck authorization inside the write transaction.
  await tx.$queryRaw`SELECT id FROM gyms WHERE id = ${actor.operator.gymId}::uuid FOR UPDATE`;
  const operator = await tx.operator.findUnique({ where: { id: actor.operator.id }, include: { gym: true, user: true } });
  const session = await tx.session.findUnique({ where: { id: actor.sessionId } });
  if (!operator || operator.role !== "OWNER" || operator.state !== "ACTIVE" || operator.gym.state !== "ACTIVE"
      || !operator.user.emailVerified || !session || session.userId !== operator.userId || session.expiresAt.getTime() <= Date.now()) throw fail();
  if (fresh && (!session.reauthenticatedAt || Date.now() - session.reauthenticatedAt.getTime() >= 300_000
      || session.reauthenticatedAt.getTime() > Date.now())) {
    throw new IdentityError(403, "Verify your password again before this action.");
  }
  return operator;
}

export async function reauthenticate(headers: Headers, password: string) {
  const actor = await getActor(headers);
  if (actor.operator.role !== "OWNER") throw fail();
  await auth.api.verifyPassword({ headers, body: { password } });
  await db.$transaction(async tx => {
    await ownerInTransaction(tx, actor, false);
    await tx.session.update({ where: { id: actor.sessionId }, data: { reauthenticatedAt: new Date() } });
    await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId, subjectId: actor.operator.userId, action: "OWNER_REAUTHENTICATED" } });
  });
}

async function issue(tx: Prisma.TransactionClient, operator: { id: string; gymId: string; userId: string }, purpose: InvitePurpose, initiatorId: string) {
  const token = randomBytes(32).toString("hex");
  const reset = purpose.endsWith("RESET");
  // Rotation is atomic with issuance; a failed delivery leaves a pending, unusable invitation.
  await tx.invitation.updateMany({ where: { operatorId: operator.id, consumedAt: null }, data: { consumedAt: new Date() } });
  const invitation = await tx.invitation.create({ data: {
    gymId: operator.gymId, operatorId: operator.id, purpose, tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + (reset ? 30 * 60_000 : 48 * 60 * 60_000)),
  } });
  await tx.identityAudit.create({ data: { gymId: operator.gymId, initiatorId, subjectId: operator.userId, action: `${purpose}_ISSUED` } });
  return { invitation, token };
}

async function deliver(issued: Awaited<ReturnType<typeof issue>>, email: string, sender: EmailSender) {
  const url = new URL("/setup", process.env.BETTER_AUTH_URL);
  // Fragment keeps the token out of HTTP request URLs, access logs, and referrers.
  url.hash = issued.token;
  try {
    await sender.send({ id: issued.invitation.id, to: email, purpose: issued.invitation.purpose, url: url.href });
    await db.$transaction(async tx => {
      await setGymContext(tx, issued.invitation.gymId);
      await tx.invitation.update({ where: { id: issued.invitation.id }, data: { sentAt: new Date() } });
    });
    return { status: "captured" as const };
  } catch {
    await db.$transaction(async tx => {
      await setGymContext(tx, issued.invitation.gymId);
      await tx.identityAudit.create({ data: { gymId: issued.invitation.gymId, initiatorId: "email-transport", subjectId: issued.invitation.operatorId, action: "EMAIL_CAPTURE_FAILED" } });
    });
    return { status: "pending" as const };
  }
}

export function validateIdentity(input: { email: string; name: string; username?: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const username = input.username?.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.test$/.test(email) || name.length < 1 || name.length > 100
      || (username !== undefined && !/^[a-z0-9_]{3,30}$/.test(username))) {
    throw new IdentityError(400, "Enter a name, reserved .test email, and a username with 3–30 letters, numbers, or underscores.");
  }
  return { email, name, username };
}

// Private local fixture, called only by a CLI using migration credentials. No web bootstrap endpoint.
export async function bootstrapSyntheticOwner(input: { gymId: string; gymName: string; email: string; name: string }, sender: EmailSender, provisioningDb: PrismaClient) {
  assertSynthetic();
  const user = validateIdentity(input);
  if (!/^[0-9a-f-]{36}$/.test(input.gymId) || !input.gymName.trim() || input.gymName.length > 100) throw new IdentityError(400, "Invalid synthetic gym fixture.");
  const result = await provisioningDb.$transaction(async tx => {
    // The unique gym fixture key makes concurrent bootstrap requests idempotent.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.gymId}, 0))`;
    const existing = await tx.gym.findUnique({ where: { id: input.gymId }, include: { operators: { include: { user: true } } } });
    if (existing) {
      const owner = existing.operators.find(op => op.role === "OWNER");
      if (owner?.user.email !== user.email || owner.state !== "PENDING" || existing.state !== "PENDING") throw fail();
      return { issued: await issue(tx, owner, "OWNER_SETUP", "synthetic-platform-reviewer"), email: owner.user.email };
    }
    const gym = await tx.gym.create({ data: { id: input.gymId, name: input.gymName.trim() } });
    const identity = await tx.user.create({ data: { id: randomUUID(), name: user.name, email: user.email } });
    const operator = await tx.operator.create({ data: { userId: identity.id, gymId: gym.id, role: "OWNER" } });
    await tx.identityAudit.create({ data: { gymId: gym.id, initiatorId: "synthetic-platform-reviewer", subjectId: identity.id, action: "SYNTHETIC_OWNERSHIP_VERIFIED_PENDING_BOOTSTRAP" } });
    return { issued: await issue(tx, operator, "OWNER_SETUP", "synthetic-platform-reviewer"), email: user.email };
  });
  return deliver(result.issued, result.email, sender);
}

export async function inviteStaff(headers: Headers, input: { email: string; name: string; username: string }, sender: EmailSender = localEmail) {
  assertSynthetic();
  const actor = await getActor(headers);
  const user = validateIdentity(input);
  const result = await db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor);
    const existing = await tx.user.findUnique({ where: { email: user.email }, include: { operator: true } });
    let operator = existing?.operator;
    if (existing) {
      if (!operator || operator.gymId !== owner.gymId || operator.role !== "STAFF" || operator.state !== "PENDING"
          || existing.username !== user.username) throw new IdentityError(409, "Invitation cannot be issued for those account details.");
    } else {
      const identity = await tx.user.create({ data: { id: randomUUID(), ...user, displayUsername: user.username } });
      operator = await tx.operator.create({ data: { userId: identity.id, gymId: owner.gymId, role: "STAFF" } });
    }
    return issue(tx, operator!, "STAFF_SETUP", owner.userId);
  });
  return deliver(result, user.email, sender);
}

export async function requestStaffReset(headers: Headers, operatorId: string, sender: EmailSender = localEmail) {
  assertSynthetic();
  const actor = await getActor(headers);
  const result = await db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor);
    const staff = await tx.operator.findFirst({ where: { id: operatorId, gymId: owner.gymId, role: "STAFF", state: "ACTIVE" }, include: { user: true } });
    if (!staff?.user.emailVerified) throw fail();
    return { issued: await issue(tx, staff, "STAFF_RESET", owner.userId), email: staff.user.email };
  });
  return deliver(result.issued, result.email, sender);
}

export async function requestOwnerReset(email: string, sender: EmailSender = localEmail) {
  assertSynthetic();
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const operator = user ? await identityBinding(user.id) : null;
  if (user?.emailVerified && operator?.role === "OWNER" && operator.state === "ACTIVE" && operator.gym.state === "ACTIVE") {
    const issued = await db.$transaction(async tx => {
      await setGymContext(tx, operator.gymId);
      await tx.$queryRaw`SELECT id FROM gyms WHERE id = ${operator.gymId}::uuid FOR UPDATE`;
      const current = await tx.operator.findUnique({ where: { id: operator.id }, include: { gym: true } });
      if (current?.state !== "ACTIVE" || current.gym.state !== "ACTIVE") throw fail();
      return issue(tx, current, "OWNER_RESET", user.id);
    });
    await deliver(issued, user.email, sender);
  }
  return { status: "If an active owner account matches, its recovery link has been captured." };
}

export async function completeSetup(token: string, password: string) {
  assertSynthetic();
  if (!/^[a-f0-9]{64}$/.test(token) || password.length < 12 || password.length > 128) throw new IdentityError(400, "Use a valid link and a password with 12–128 characters.");
  const passwordHash = await (await auth.$context).password.hash(password);
  await db.$transaction(async tx => {
    const [scope] = await tx.$queryRaw<{ gymId: string | null }[]>`SELECT public.setup_scope(${tokenHash(token)}) AS "gymId"`;
    if (!scope.gymId) throw invalidLink();
    await setGymContext(tx, scope.gymId);
    const found = await tx.invitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!found) throw invalidLink();
    await tx.$queryRaw`SELECT id FROM gyms WHERE id = ${found.gymId}::uuid FOR UPDATE`;
    const invitation = await tx.invitation.findUnique({ where: { id: found.id }, include: { operator: { include: { user: true, gym: true } } } });
    if (!invitation || invitation.consumedAt || !invitation.sentAt || invitation.expiresAt.getTime() <= Date.now()) throw invalidLink();
    const operator = invitation.operator;
    const isOwner = invitation.purpose === "OWNER_SETUP";
    const reset = invitation.purpose.endsWith("RESET");
    if (operator.state !== (reset ? "ACTIVE" : "PENDING") || operator.gym.state !== (isOwner ? "PENDING" : "ACTIVE")
        || (reset && !operator.user.emailVerified)) throw invalidLink();
    await tx.invitation.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } });
    await tx.account.upsert({ where: { id: `credential:${operator.userId}` },
      create: { id: `credential:${operator.userId}`, accountId: operator.userId, providerId: "credential", userId: operator.userId, password: passwordHash },
      update: { password: passwordHash } });
    await tx.user.update({ where: { id: operator.userId }, data: { emailVerified: true } });
    await tx.operator.update({ where: { id: operator.id }, data: { state: "ACTIVE" } });
    if (isOwner) {
      if (await tx.operator.count({ where: { gymId: operator.gymId, role: "OWNER", state: "ACTIVE" } }) !== 1) throw fail();
      await tx.gym.update({ where: { id: operator.gymId }, data: { state: "ACTIVE" } });
    }
    await tx.session.deleteMany({ where: { userId: operator.userId } });
    await tx.identityAudit.create({ data: { gymId: operator.gymId, initiatorId: operator.userId, subjectId: operator.userId, action: `${invitation.purpose}_COMPLETED` } });
  });
}

export async function disableStaff(headers: Headers, operatorId: string) {
  const actor = await getActor(headers);
  await db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor);
    const staff = await tx.operator.findFirst({ where: { id: operatorId, gymId: owner.gymId, role: "STAFF" } });
    if (!staff) throw fail();
    await tx.operator.update({ where: { id: staff.id }, data: { state: "DISABLED" } });
    await tx.session.deleteMany({ where: { userId: staff.userId } });
    await tx.invitation.updateMany({ where: { operatorId: staff.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: staff.userId, action: "STAFF_DISABLED_SESSIONS_REVOKED" } });
  });
}

export async function setCapabilities(headers: Headers, operatorId: string, capabilities: { canManageMembers: boolean; canCollectCash: boolean }) {
  const actor = await getActor(headers);
  await db.$transaction(async tx => {
    const owner = await ownerInTransaction(tx, actor);
    const staff = await tx.operator.findFirst({ where: { id: operatorId, gymId: owner.gymId, role: "STAFF", state: "ACTIVE" } });
    if (!staff) throw fail();
    await tx.operator.update({ where: { id: staff.id }, data: capabilities });
    await tx.identityAudit.create({ data: { gymId: owner.gymId, initiatorId: owner.userId, subjectId: staff.userId,
      action: `STAFF_CAPABILITIES_MEMBERS_${capabilities.canManageMembers}_CASH_${capabilities.canCollectCash}` } });
  });
}

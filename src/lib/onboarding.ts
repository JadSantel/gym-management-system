import { randomUUID } from "node:crypto";
import { auth } from "./auth";
import { db } from "./db";
import { assertSynthetic, localEmail, type EmailSender } from "./email";
import { deliverIdentityMessage, IdentityError, issueOwnerSetup, provisionPendingOwner } from "./identity";
import { platformAdminBinding, setGymContext, setPlatformAdminContext } from "./binding";
import { onboardingDecisionSchema, onboardingRequestSchema } from "./onboarding-schema";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

const normalizeGymName = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const isUniqueConflict = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
async function appendPlatformAudit(tx: Prisma.TransactionClient, platformAdminId: string, requestId: string | null, action: string) {
  await tx.$executeRaw`INSERT INTO platform_audit_events (id, platform_admin_id, onboarding_request_id, action)
    VALUES (${randomUUID()}::uuid, ${platformAdminId}, ${requestId}::uuid, ${action})`;
}

export async function submitOnboardingRequest(input: unknown) {
  assertSynthetic();
  const parsed = onboardingRequestSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the request fields.", Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  const gymKey = normalizeGymName(parsed.data.gymName);
  // Avoid INSERT ... RETURNING: public callers must not receive a row through the admin-only SELECT policy.
  await db.$executeRaw`INSERT INTO onboarding_requests (id, gym_name, normalized_gym_name, owner_name, email, normalized_email, state)
    VALUES (${randomUUID()}::uuid, ${parsed.data.gymName}, ${gymKey}, ${parsed.data.ownerName}, ${parsed.data.email}, ${parsed.data.email}, 'PENDING')
    ON CONFLICT DO NOTHING`;
  return { status: "Your request was received. Gym access is provided only after review." };
}

export async function getPlatformAdmin(headers: Headers) {
  assertSynthetic();
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session) throw new IdentityError(401, "Sign in to continue.");
  if (!await platformAdminBinding(session.user.id)) throw new IdentityError(403, "Platform access is unavailable.");
  return { userId: session.user.id, name: session.user.name, email: session.user.email };
}

export async function listOnboardingRequests(headers: Headers) {
  const admin = await getPlatformAdmin(headers);
  return db.$transaction(async tx => {
    await setPlatformAdminContext(tx, admin.userId);
    const requests = await tx.onboardingRequest.findMany({
      orderBy: [{ createdAt: "desc" }], take: 100,
      select: {
        id: true, gymName: true, ownerName: true, email: true, state: true, createdAt: true, decidedAt: true,
        provisionedGymId: true,
      },
    });
    const results = [];
    for (const request of requests) {
      let provisionedGym = null;
      if (request.provisionedGymId) {
        await setGymContext(tx, request.provisionedGymId);
        provisionedGym = await tx.gym.findUnique({
          where: { id: request.provisionedGymId },
          select: {
            state: true,
            operators: {
              where: { role: "OWNER" }, take: 1,
              select: {
                state: true,
                invitations: {
                  where: { purpose: "OWNER_SETUP" }, orderBy: { createdAt: "desc" }, take: 1,
                  select: { sentAt: true, expiresAt: true, consumedAt: true },
                },
              },
            },
          },
        });
      }
      const owner = provisionedGym?.operators[0];
      const invitation = owner?.invitations[0];
      const canReissue = request.state === "APPROVED"
        && provisionedGym?.state === "PENDING"
        && owner?.state === "PENDING"
        && !!invitation
        && !invitation.consumedAt
        && (!invitation.sentAt || invitation.expiresAt.getTime() <= Date.now());
      results.push({ ...request, provisionedGym, canReissue });
    }
    return results;
  });
}

export async function decideOnboardingRequest(headers: Headers, input: unknown, sender: EmailSender = localEmail) {
  const admin = await getPlatformAdmin(headers);
  const parsed = onboardingDecisionSchema.safeParse(input);
  if (!parsed.success) throw new IdentityError(400, "Check the review decision.", Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  const outcome = await db.$transaction(async tx => {
    await setPlatformAdminContext(tx, admin.userId);
    await tx.$queryRaw`SELECT id FROM onboarding_requests WHERE id = ${parsed.data.requestId}::uuid FOR UPDATE`;
    const request = await tx.onboardingRequest.findUnique({ where: { id: parsed.data.requestId } });
    if (!request) throw new IdentityError(404, "Request not found.");
    if (request.state !== "PENDING") return { state: request.state as "APPROVED" | "DECLINED", issued: null as Awaited<ReturnType<typeof issueOwnerSetup>> | null, email: "" };

    if (parsed.data.decision === "DECLINE") {
      await tx.onboardingRequest.update({ where: { id: request.id }, data: { state: "DECLINED", decidedAt: new Date(), decidedByUserId: admin.userId } });
      await appendPlatformAudit(tx, admin.userId, request.id, "ONBOARDING_REQUEST_DECLINED");
      return { state: "DECLINED" as const, issued: null, email: "" };
    }

    if (!parsed.data.syntheticOwnershipVerified) throw new IdentityError(400, "Confirm the synthetic ownership review before approval.");
    if (await tx.user.findUnique({ where: { email: request.normalizedEmail } })) throw new IdentityError(409, "This email is already connected to an account. Resolve that account before approving this request.");
    try {
      const owner = await provisionPendingOwner(tx, { gymName: request.gymName, name: request.ownerName, email: request.normalizedEmail }, admin.userId);
      await tx.onboardingRequest.update({ where: { id: request.id }, data: {
        state: "APPROVED", decidedAt: new Date(), decidedByUserId: admin.userId, provisionedGymId: owner.gymId,
      } });
      await appendPlatformAudit(tx, admin.userId, request.id, "ONBOARDING_REQUEST_APPROVED");
      return { state: "APPROVED" as const, issued: owner.issued, email: owner.email };
    } catch (error) {
      if (isUniqueConflict(error)) throw new IdentityError(409, "This email is already connected to an account. Resolve that account before approving this request.");
      throw error;
    }
  });
  if (!outcome.issued) return { status: outcome.state };
  const delivery = await deliverIdentityMessage(outcome.issued, outcome.email, sender);
  return { status: outcome.state, invitation: delivery.status };
}

export async function retryOnboardingInvitation(headers: Headers, requestId: string, sender: EmailSender = localEmail) {
  const admin = await getPlatformAdmin(headers);
  const outcome = await db.$transaction(async tx => {
    await setPlatformAdminContext(tx, admin.userId);
    const request = await tx.onboardingRequest.findUnique({ where: { id: requestId } });
    if (request?.state !== "APPROVED" || !request.provisionedGymId) throw new IdentityError(409, "This request has no pending owner invitation.");
    await setGymContext(tx, request.provisionedGymId);
    const owner = await tx.operator.findFirst({ where: { gymId: request.provisionedGymId, role: "OWNER" }, include: { user: true, invitations: {
      where: { purpose: "OWNER_SETUP" }, orderBy: { createdAt: "desc" }, take: 1,
    } } });
    if (!owner || owner.state !== "PENDING" || owner.gymId !== request.provisionedGymId) throw new IdentityError(409, "This request has no pending owner invitation.");
    const current = owner.invitations[0];
    if (!current || (current.sentAt && current.expiresAt.getTime() > Date.now())) return { alreadySent: true as const, issued: null, email: "" };
    const issued = await issueOwnerSetup(tx, owner, admin.userId);
    await appendPlatformAudit(tx, admin.userId, request.id, "OWNER_SETUP_INVITATION_RETRIED");
    return { alreadySent: false as const, issued, email: owner.user.email };
  });
  if (!outcome.issued) return { status: outcome.alreadySent ? "already-sent" : "pending" };
  return { status: (await deliverIdentityMessage(outcome.issued, outcome.email, sender)).status };
}

export async function bootstrapSyntheticPlatformAdmin(email: string, name: string, password: string, provisioningDb: PrismaClient) {
  const config = assertSynthetic();
  if (config.SYNTHETIC_DATA_ONLY !== "true" || !/^[^\s@]+@[^\s@]+\.test$/i.test(email)) throw new IdentityError(400, "Use a reserved synthetic .test email address.");
  const valid = onboardingRequestSchema.shape.ownerName.safeParse(name);
  if (!valid.success || password.length < 12 || password.length > 128) throw new IdentityError(400, "Check the synthetic administrator details.");
  const existing = await provisioningDb.user.findUnique({ where: { email: email.toLowerCase() }, include: { operator: true, memberAccount: true, platformAdmin: true } });
  if (existing) {
    if (!existing.platformAdmin || existing.operator || existing.memberAccount) throw new IdentityError(409, "This identity is already bound to another account type.");
    return { status: "already-provisioned" as const };
  }
  const passwordHash = await (await auth.$context).password.hash(password);
  const userId = randomUUID();
  await provisioningDb.$transaction(async tx => {
    await tx.user.create({ data: { id: userId, name: valid.data, email: email.toLowerCase(), emailVerified: true,
      accounts: { create: { id: `credential:${userId}`, accountId: userId, providerId: "credential", password: passwordHash } },
      platformAdmin: { create: { state: "ACTIVE" } },
    } });
    await setPlatformAdminContext(tx, userId);
    await tx.platformAuditEvent.create({ data: { id: randomUUID(), platformAdminId: userId, action: "SYNTHETIC_PLATFORM_ADMIN_PROVISIONED" } });
  });
  return { status: "provisioned" as const };
}

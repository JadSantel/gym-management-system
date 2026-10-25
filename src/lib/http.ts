import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { auth } from "./auth";
import { db } from "./db";
import { getActor, IdentityError } from "./identity";
import { assertSynthetic } from "./email";
import { setGymContext } from "./binding";

// Never copy URLs, query values, headers, payloads or caught errors into diagnostics.
function diagnosticOperation(request: Request) {
  const path = new URL(request.url).pathname;
  const routes = ["/api/members", "/api/plans", "/api/charges", "/api/payments", "/api/digital", "/api/investigations", "/api/outage",
    ...["session", "operators", "setup", "reauthenticate", "invite", "reset-owner", "reset-staff", "disable", "capabilities"].map(action => `/api/identity/${action}`)];
  return { method: ["GET", "POST"].includes(request.method) ? request.method : "OTHER", route: routes.includes(path) ? path : "/api/other" };
}
function diagnostic(request: Request, event: "REQUEST_FAILED" | "DENIAL_AUDIT_FAILED", reference: string, status: number) {
  console.error(JSON.stringify({ event, reference, ...diagnosticOperation(request), status }));
}

async function recordDenial(request: Request, status: number) {
  const reference = randomUUID();
  try {
    const actor = await getActor(request.headers);
    const { method, route } = diagnosticOperation(request);
    // Business transactions have already rolled back. Preserve denial evidence separately,
    // under the verified actor's tenant, without client-supplied target IDs or contents.
    await db.$transaction(async tx => {
      await setGymContext(tx, actor.operator.gymId);
      await tx.identityAudit.create({ data: { gymId: actor.operator.gymId, initiatorId: actor.operator.userId,
        subjectId: actor.operator.userId, action: `ACCESS_DENIED ${method} ${route} ${status} ${reference}` } });
    });
    return reference;
  } catch (error) {
    // Anonymous, revoked or inactive identities cannot supply trustworthy attribution.
    if (error instanceof IdentityError && (error.status === 401 || error.status === 403)) return;
    diagnostic(request, "DENIAL_AUDIT_FAILED", reference, status);
    return reference;
  }
}

export async function rateLimit(headers: Headers, action: string, max = 30, publicAction = false) {
  let subject = "anonymous";
  let denial: IdentityError | undefined;
  if (!publicAction) {
    try {
      const actor = await getActor(headers);
      subject = `actor:${actor.operator.id}`;
    } catch (error) {
      if (!(error instanceof IdentityError) || (error.status !== 401 && error.status !== 403)) throw error;
      denial = error;
    }
  }
  // No request header is a trusted client IP in the current local-only contract.
  // Anonymous callers share a bounded bucket, separate from every verified actor.
  const now = BigInt(Date.now());
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO auth_rate_limits (id, key, count, "lastRequest") VALUES (${randomUUID()}, ${`identity:${action}:${subject}`}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_rate_limits."lastRequest" <= ${now - 60_000n} THEN 1 ELSE LEAST(auth_rate_limits.count, ${max}) + 1 END,
    "lastRequest" = CASE WHEN auth_rate_limits."lastRequest" <= ${now - 60_000n} THEN ${now} ELSE auth_rate_limits."lastRequest" END RETURNING count`;
  if (rows[0].count > max) throw new IdentityError(429, "Too many requests. Wait one minute and try again.");
  if (denial) throw denial;
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new IdentityError(415, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new IdentityError(400, "Enter the required fields.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new IdentityError(413, "Request is too large."); }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new IdentityError(400, "Invalid request."); }
}
export async function apiResponse(request: Request, work: () => Promise<unknown>) {
  let renewal: Headers | undefined;
  let output: Response;
  try {
    // No deployed ingress/proxy contract has been verified. Keep non-local APIs closed.
    let config: ReturnType<typeof assertSynthetic>;
    try { config = assertSynthetic(); } catch { throw new IdentityError(503, "Deployment proxy trust has not been verified."); }
    if (request.method !== "GET" && request.headers.get("origin") !== config.BETTER_AUTH_URL) throw new IdentityError(403, "Request origin is not allowed.");
    if (request.headers.has("cookie")) renewal = (await auth.api.getSession({ headers: request.headers, returnHeaders: true, query: { disableCookieCache: true } })).headers;
    output = Response.json(await work() ?? { status: "ok" });
  } catch (error) {
    const known = error instanceof IdentityError;
    const status = known ? error.status : error instanceof APIError ? 401 : typeof error === "object" && error && "code" in error && error.code === "P2002" ? 409 : 500;
    const reference = status === 500 ? randomUUID() : [401, 403].includes(status) ? await recordDenial(request, status) : undefined;
    if (status === 500) diagnostic(request, "REQUEST_FAILED", reference!, status);
    const message = status === 500 ? "Request could not be completed. Try again." : known ? error.message : status === 409 ? "Those record details are unavailable." : "Unable to verify your password.";
    output = Response.json({ error: reference ? `${message} Reference: ${reference}.` : message,
      ...(reference ? { errorReference: reference } : {}),
      ...(known && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) }, { status });
  }
  output.headers.set("cache-control", "no-store");
  for (const cookie of renewal?.getSetCookie() ?? []) output.headers.append("set-cookie", cookie);
  return output;
}

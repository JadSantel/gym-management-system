import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { auth } from "./auth";
import { db } from "./db";
import { IdentityError } from "./identity";

export async function rateLimit(action: string, max = 30) {
  const now = BigInt(Date.now());
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO auth_rate_limits (id, key, count, "lastRequest") VALUES (${randomUUID()}, ${`identity:${action}`}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_rate_limits."lastRequest" <= ${now - 60_000n} THEN 1 ELSE auth_rate_limits.count + 1 END,
    "lastRequest" = CASE WHEN auth_rate_limits."lastRequest" <= ${now - 60_000n} THEN ${now} ELSE auth_rate_limits."lastRequest" END RETURNING count`;
  if (rows[0].count > max) throw new IdentityError(429, "Too many requests. Wait one minute and try again.");
}
export function field(body: Record<string, unknown>, key: string, max = 254) {
  if (typeof body[key] !== "string" || body[key].length < 1 || body[key].length > max) throw new IdentityError(400, "Check the required fields and try again.");
  return body[key];
}
export function uuid(value: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new IdentityError(400, "Invalid record reference.");
  return value;
}
export function onlyFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new IdentityError(400, "Unsupported request fields. Prices and terms are controlled by the gym owner.");
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
    if (request.method !== "GET" && request.headers.get("origin") !== process.env.BETTER_AUTH_URL) throw new IdentityError(403, "Request origin is not allowed.");
    if (request.headers.has("cookie")) renewal = (await auth.api.getSession({ headers: request.headers, returnHeaders: true, query: { disableCookieCache: true } })).headers;
    output = Response.json(await work() ?? { status: "ok" });
  } catch (error) {
    const known = error instanceof IdentityError;
    const status = known ? error.status : error instanceof APIError ? 401 : typeof error === "object" && error && "code" in error && error.code === "P2002" ? 409 : 500;
    output = Response.json({ error: known ? error.message : status === 409 ? "Those record details are unavailable." : status === 401 ? "Unable to verify your password." : "Request could not be completed. Try again." }, { status });
  }
  output.headers.set("cache-control", "no-store");
  for (const cookie of renewal?.getSetCookie() ?? []) output.headers.append("set-cookie", cookie);
  return output;
}

import { z } from "zod";
import { legacyCommand, LegacyRejected } from "@/lib/legacy";
import { legacyCommandSchema, legacyFieldErrors } from "@/lib/legacy-schema";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = legacyCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) { rejected = true; throw new IdentityError(400, "Check the legacy fields. Only displayed fields are accepted.", legacyFieldErrors(parsed.error)); }
    const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) { rejected = true; throw new IdentityError(400, "Use a valid operation key."); }
    await rateLimit(request.headers, "legacy");
    try { return await legacyCommand(request.headers, parsed.data, key.data); }
    catch (error) { rejected = error instanceof LegacyRejected; throw error; }
  });
  if (rejected) response.headers.set("legacy-command-outcome", "not-recorded");
  return response;
}

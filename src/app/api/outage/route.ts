import { outageCommand, outageOverview, OutageRejected } from "@/lib/outage";
import { outageCommandSchema, outageFieldErrors, outageKeySchema } from "@/lib/outage-schema";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function GET(request: Request) {
  return apiResponse(request, () => outageOverview(request.headers));
}
export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = outageCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) { rejected = true; throw new IdentityError(400, "Check the outage fields. Only displayed fields are accepted.", outageFieldErrors(parsed.error)); }
    const key = outageKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) { rejected = true; throw new IdentityError(400, "A valid Idempotency-Key is required for outage records."); }
    await rateLimit(request.headers, "outage-record");
    try { return await outageCommand(request.headers, parsed.data, key.data); }
    catch (error) { rejected = error instanceof OutageRejected; throw error; }
  });
  if (rejected) response.headers.set("outage-command-outcome", "not-recorded");
  return response;
}

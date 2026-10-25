import { CaseRecordRejected, investigationCommand, investigationDetail, paymentHistory } from "@/lib/investigations";
import { investigationCommandSchema, investigationFieldErrors, investigationKeySchema } from "@/lib/investigation-schema";
import { apiResponse, readBody, rateLimit } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function GET(request: Request) {
  return apiResponse(request, async () => {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    if (Object.keys(query).length === 1 && query.caseId) return investigationDetail(request.headers, query.caseId);
    return paymentHistory(request.headers, query);
  });
}
export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = investigationCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Check the case fields. Only displayed fields are accepted.", investigationFieldErrors(parsed.error));
    const key = investigationKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new IdentityError(400, "A valid Idempotency-Key is required for case records.");
    await rateLimit(request.headers, "investigation-record");
    try { return await investigationCommand(request.headers, parsed.data, key.data); }
    catch (error) { rejected = error instanceof CaseRecordRejected; throw error; }
  });
  if (rejected) response.headers.set("case-command-outcome", "not-recorded");
  return response;
}

import { closingCommand, closingOverview, ClosingRejected } from "@/lib/closing";
import { closingCommandSchema, closingDaySchema, closingFieldErrors, closingKeySchema } from "@/lib/closing-schema";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function GET(request: Request) {
  return apiResponse(request, async () => {
    const values = new URL(request.url).searchParams.getAll("day");
    const parsed = closingDaySchema.safeParse(values.length === 1 ? values[0] : null);
    if (!parsed.success) throw new IdentityError(400, "Choose one valid business date.");
    return closingOverview(request.headers, parsed.data);
  });
}
export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = closingCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) { rejected = true; throw new IdentityError(400, "Check the closing fields. Only displayed fields are accepted.", closingFieldErrors(parsed.error)); }
    const key = closingKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) { rejected = true; throw new IdentityError(400, "A valid Idempotency-Key is required for closing."); }
    await rateLimit(request.headers, "daily-closing");
    try { return await closingCommand(request.headers, parsed.data, key.data); }
    catch (error) { rejected = error instanceof ClosingRejected; throw error; }
  });
  if (rejected) response.headers.set("closing-command-outcome", "not-recorded");
  return response;
}

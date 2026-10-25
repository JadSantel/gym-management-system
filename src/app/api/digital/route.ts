import { digitalCommand, digitalOverview, DigitalConfirmationRejected } from "@/lib/digital";
import { digitalCommandSchema, digitalFieldErrors, digitalOperationKeySchema } from "@/lib/digital-schema";
import { apiResponse, readBody, rateLimit } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function GET(request: Request) {
  return apiResponse(request, () => digitalOverview(request.headers));
}
export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = digitalCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Check the digital payment fields. Only the displayed fields are accepted.", digitalFieldErrors(parsed.error));
    let key: string | undefined;
    if (parsed.data.action === "confirm") {
      const result = digitalOperationKeySchema.safeParse(request.headers.get("idempotency-key"));
      if (!result.success) throw new IdentityError(400, "A valid Idempotency-Key is required for digital confirmation.");
      key = result.data;
    } else await rateLimit(request.headers, "digital-record");
    try { return await digitalCommand(request.headers, parsed.data, key); }
    catch (error) { rejected = error instanceof DigitalConfirmationRejected; throw error; }
  });
  if (rejected) response.headers.set("digital-confirmation-outcome", "not-confirmed");
  return response;
}

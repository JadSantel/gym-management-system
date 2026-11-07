import { CashConfirmationRejected, confirmOnline } from "@/lib/charges";
import { apiResponse, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { onlineConfirmationSchema, idempotencyKeySchema } from "@/lib/finance-schema";

export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = onlineConfirmationSchema.safeParse(await readBody(request));
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!parsed.success || !key.success) throw new IdentityError(400, "Check the provider, full amount, reference and received-funds confirmation.");
    try { return await confirmOnline(request.headers, parsed.data, key.data); }
    catch (error) { rejected = error instanceof CashConfirmationRejected; throw error; }
  });
  if (rejected) response.headers.set("payment-confirmation-outcome", "not-confirmed");
  return response;
}

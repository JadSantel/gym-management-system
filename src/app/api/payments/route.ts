import { CashConfirmationRejected, confirmCash } from "@/lib/charges";
import { apiResponse, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { cashConfirmationSchema, financeFieldErrors, idempotencyKeySchema } from "@/lib/finance-schema";

export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const parsed = cashConfirmationSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Check the cash fields. Only the charge reference and cash amount are accepted.", financeFieldErrors(parsed.error));
    const operationKey = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!operationKey.success) {
      throw new IdentityError(400, "A valid Idempotency-Key is required for cash confirmation.");
    }
    try {
      return await confirmCash(request.headers, parsed.data.chargeId, parsed.data.cashReceived, operationKey.data);
    } catch (error) {
      rejected = error instanceof CashConfirmationRejected;
      throw error;
    }
  });
  // An HTTP status alone cannot settle an earlier attempt. This marker follows
  // same-key lookup/serialization and a rejection before any financial writes.
  if (rejected) response.headers.set("cash-confirmation-outcome", "not-confirmed");
  return response;
}

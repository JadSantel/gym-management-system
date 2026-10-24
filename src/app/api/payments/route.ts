import { CashConfirmationRejected, confirmCash } from "@/lib/charges";
import { apiResponse, field, onlyFields, readBody, uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function POST(request: Request) {
  let rejected = false;
  const response = await apiResponse(request, async () => {
    const body = await readBody(request);
    onlyFields(body, ["chargeId", "cashReceived"]);
    const operationKey = request.headers.get("idempotency-key") ?? "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(operationKey)) {
      throw new IdentityError(400, "A valid Idempotency-Key is required for cash confirmation.");
    }
    try {
      return await confirmCash(request.headers, uuid(field(body, "chargeId", 36)), field(body, "cashReceived", 32), operationKey);
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

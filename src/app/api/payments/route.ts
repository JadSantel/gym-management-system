import { confirmCash } from "@/lib/charges";
import { apiResponse, field, onlyFields, readBody, uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";

export async function POST(request: Request) {
  return apiResponse(request, async () => {
    const body = await readBody(request);
    onlyFields(body, ["chargeId", "cashReceived"]);
    const operationKey = request.headers.get("idempotency-key") ?? "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(operationKey)) {
      throw new IdentityError(400, "A valid Idempotency-Key is required for cash confirmation.");
    }
    return confirmCash(request.headers, uuid(field(body, "chargeId", 36)), field(body, "cashReceived", 32), operationKey);
  });
}

import { prepareCharge, readCharge } from "@/lib/charges";
import { apiResponse, field, onlyFields, rateLimit, readBody, uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
export async function GET(request: Request) {
  return apiResponse(request, async () => {
    const charge = await readCharge(request.headers, uuid(new URL(request.url).searchParams.get("id") ?? ""));
    if (!charge) throw new IdentityError(404, "Charge preview unavailable.");
    return charge;
  });
}
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "charge-preview");
    const body = await readBody(request);
    onlyFields(body, ["memberId", "planId"]);
    return prepareCharge(request.headers, uuid(field(body, "memberId", 36)), uuid(field(body, "planId", 36)));
  });
}

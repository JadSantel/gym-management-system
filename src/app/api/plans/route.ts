import { listPlans, changePlans } from "@/lib/plans";
import { apiResponse, field, onlyFields, rateLimit, readBody, uuid } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
export async function GET(request: Request) { return apiResponse(request, () => listPlans(request.headers)); }
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "plan-pricing");
    const body = await readBody(request);
    if (body.action === "initialize") { onlyFields(body, ["action"]); return changePlans(request.headers, { action: "initialize" }); }
    if (body.action !== "update" || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1 || body.version >= 2_147_483_647) throw new IdentityError(400, "Use a current approved plan and price.");
    onlyFields(body, ["action", "planId", "price", "version"]);
    return changePlans(request.headers, { action: "update", planId: uuid(field(body, "planId", 36)), price: field(body, "price", 12), version: body.version });
  });
}

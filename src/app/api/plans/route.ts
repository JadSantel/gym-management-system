import { listPlans, changePlans } from "@/lib/plans";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { planChangeSchema, financeFieldErrors } from "@/lib/finance-schema";
export async function GET(request: Request) { return apiResponse(request, () => listPlans(request.headers)); }
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "plan-pricing");
    const parsed = planChangeSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Use a current approved plan and price. Only catalogue initialization and price updates are accepted.", financeFieldErrors(parsed.error));
    return changePlans(request.headers, parsed.data);
  });
}

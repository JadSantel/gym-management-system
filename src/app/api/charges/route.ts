import { prepareCharge, readCharge } from "@/lib/charges";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
import { chargePrepareSchema, financeFieldErrors } from "@/lib/finance-schema";
import { recordParamsSchema } from "@/lib/route-schema";
export async function GET(request: Request) {
  return apiResponse(request, async () => {
    const ids = new URL(request.url).searchParams.getAll("id");
    const parsed = recordParamsSchema.safeParse({ id: ids.length === 1 ? ids[0] : ids });
    if (!parsed.success) throw new IdentityError(400, "Invalid record reference.");
    const charge = await readCharge(request.headers, parsed.data.id);
    if (!charge) throw new IdentityError(404, "Charge preview unavailable.");
    return charge;
  });
}
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "charge-preview");
    const parsed = chargePrepareSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Choose a valid member and approved plan. Only member and plan references are accepted.", financeFieldErrors(parsed.error));
    return prepareCharge(request.headers, parsed.data.memberId, parsed.data.planId);
  });
}

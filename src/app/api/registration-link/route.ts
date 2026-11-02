import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { registrationLink } from "@/lib/registration";
import { z } from "zod";
import { IdentityError } from "@/lib/identity";
export async function GET(request: Request) {
  return apiResponse(request, () => registrationLink(request.headers));
}
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "registration-link");
    if (!z.strictObject({ action: z.literal("replace") }).safeParse(await readBody(request)).success) throw new IdentityError(400, "Invalid registration link action.");
    return registrationLink(request.headers, true);
  });
}

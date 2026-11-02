import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { registerMember } from "@/lib/registration";
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "public-registration", 20, true);
    return registerMember((await context.params).code, await readBody(request));
  });
}

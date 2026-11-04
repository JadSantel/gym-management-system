import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { memberAccess, issueMemberAccess } from "@/lib/member-access";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return apiResponse(request, async () => memberAccess(request.headers, (await context.params).id));
}
export async function POST(request: Request, context: Context) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "member-access");
    return issueMemberAccess(request.headers, (await context.params).id, await readBody(request));
  });
}

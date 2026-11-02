import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { updateMemberContacts } from "@/lib/members";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "member-contacts");
    return updateMemberContacts(request.headers, (await context.params).id, await readBody(request));
  });
}

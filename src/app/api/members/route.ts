import { createMember, findMembers } from "@/lib/members";
import { apiResponse, field, rateLimit, readBody } from "@/lib/http";
import { IdentityError } from "@/lib/identity";
export async function GET(request: Request) {
  return apiResponse(request, () => findMembers(request.headers, new URL(request.url).searchParams.get("q") ?? ""));
}
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit("member-create");
    const body = await readBody(request);
    if (body.confirmDuplicate !== undefined && typeof body.confirmDuplicate !== "boolean") throw new IdentityError(400, "Confirm duplicate review explicitly.");
    return createMember(request.headers, field(body, "fullName", 100), body.confirmDuplicate === true);
  });
}

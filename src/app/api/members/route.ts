import { createMember, findMembers } from "@/lib/members";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
export async function GET(request: Request) {
  const queries = new URL(request.url).searchParams.getAll("q");
  return apiResponse(request, () => findMembers(request.headers, queries.length > 1 ? queries : queries[0] ?? ""));
}
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit("member-create");
    return createMember(request.headers, await readBody(request));
  });
}

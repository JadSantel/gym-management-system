import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { memberQr } from "@/lib/attendance";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => memberQr(request.headers, (await context.params).id));
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => { await rateLimit(request.headers, "member-qr"); return memberQr(request.headers, (await context.params).id, await readBody(request)); });
}

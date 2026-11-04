import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { memberDashboard, completeMemberSetup, recoverMember } from "@/lib/member-access";
import { IdentityError } from "@/lib/identity";

type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, context: Context) {
  const { action } = await context.params;
  const response = await apiResponse(request, async () => {
    if ((action !== "dashboard" && action !== "qr") || new URL(request.url).search) throw new IdentityError(404, "Member action unavailable.");
    const data = await memberDashboard(request.headers);
    if (action === "qr" && !data.qr) throw new IdentityError(409, "A current eligible membership and personal QR are required. Ask reception for help.");
    return data;
  });
  if (action !== "qr" || !response.ok) return response;
  const data = await response.json();
  const headers = new Headers(response.headers);
  headers.set("content-type", "image/png");
  headers.set("content-disposition", 'attachment; filename="my-gym-qr.png"');
  headers.delete("content-length");
  return new Response(Buffer.from(data.qr.split(",")[1], "base64"), { headers });
}
export async function POST(request: Request, context: Context) {
  return apiResponse(request, async () => {
    const { action } = await context.params;
    if (action !== "setup" && action !== "recover") throw new IdentityError(404, "Member action unavailable.");
    await rateLimit(request.headers, `member-${action}`, 20, true);
    const body = await readBody(request);
    return action === "setup" ? completeMemberSetup(body) : recoverMember(body);
  });
}

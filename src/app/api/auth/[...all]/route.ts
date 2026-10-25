import { auth } from "@/lib/auth";
import { authEndpointSchema } from "@/lib/route-schema";

// Expose only the entry points reviewed for this product. Provider signup/account mutation routes stay private.
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  if (!authEndpointSchema.safeParse(path).success) return Response.json({ error: "Not available." }, { status: 404 });
  return auth.handler(request);
}
export { handle as GET, handle as POST };

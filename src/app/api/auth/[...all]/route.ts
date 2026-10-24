import { auth } from "@/lib/auth";

// Expose only the entry points reviewed for this product. Provider signup/account mutation routes stay private.
const allowed = new Set(["sign-in/email", "sign-in/username", "sign-out", "get-session"]);
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  if (!allowed.has(path)) return Response.json({ error: "Not available." }, { status: 404 });
  return auth.handler(request);
}
export { handle as GET, handle as POST };

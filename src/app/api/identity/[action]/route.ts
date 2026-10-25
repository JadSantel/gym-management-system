import { completeSetup, disableStaff, getActor, IdentityError, inviteStaff, reauthenticate, requestOwnerReset, requestStaffReset, setCapabilities } from "@/lib/identity";
import { inGym } from "@/lib/tenant";
import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { identitySchemas, identityFieldErrors } from "@/lib/identity-schema";
import type { z } from "zod";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new IdentityError(400, "Check the account fields and try again.", identityFieldErrors(result.error));
  return result.data;
}

const postActions = new Set(["setup", "reauthenticate", "invite", "reset-owner", "reset-staff", "disable", "capabilities"]);
type Context = { params: Promise<{ action: string }> };
async function handle(request: Request, context: Context) {
  return apiResponse(request, async () => {
    const { action } = await context.params;
    if (request.method === "GET") {
      if (action !== "session" && action !== "operators") throw new IdentityError(404, "Not available.");
      const actor = await getActor(request.headers);
      if (action === "session") return { name: actor.operator.user.name, role: actor.operator.role, gymName: actor.operator.gym.name };
      return inGym(request.headers, "OWNER", tx => tx.operator.findMany({ orderBy: { createdAt: "asc" },
        select: { id: true, role: true, state: true, canManageMembers: true, canCollectCash: true, user: { select: { name: true, email: true, username: true, emailVerified: true } } } }));
    }
    if (!postActions.has(action)) throw new IdentityError(404, "Not available.");
    await rateLimit(request.headers, action, action === "reauthenticate" ? 5 : 30, action === "setup" || action === "reset-owner");
    const body = await readBody(request);
    switch (action) {
      case "setup": {
        const { token, password } = parse(identitySchemas.setup, body);
        return completeSetup(token, password);
      }
      case "reauthenticate": return reauthenticate(request.headers, parse(identitySchemas.reauthenticate, body).password);
      case "invite": return inviteStaff(request.headers, parse(identitySchemas.invite, body));
      case "reset-owner": return requestOwnerReset(parse(identitySchemas["reset-owner"], body).email);
      case "reset-staff": return requestStaffReset(request.headers, parse(identitySchemas["reset-staff"], body).operatorId);
      case "disable": return disableStaff(request.headers, parse(identitySchemas.disable, body).operatorId);
      case "capabilities": {
        const { operatorId, canManageMembers, canCollectCash } = parse(identitySchemas.capabilities, body);
        return setCapabilities(request.headers, operatorId, { canManageMembers, canCollectCash });
      }
    }
  });
}
export { handle as GET, handle as POST };

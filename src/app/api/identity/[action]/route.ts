import { completeSetup, disableStaff, getActor, IdentityError, inviteStaff, reauthenticate, requestOwnerReset, requestStaffReset, setCapabilities } from "@/lib/identity";
import { inGym } from "@/lib/tenant";
import { apiResponse, field, rateLimit, readBody, uuid } from "@/lib/http";

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
    await rateLimit(action, action === "reauthenticate" ? 5 : 30);
    const body = await readBody(request);
    switch (action) {
      case "setup": return completeSetup(field(body, "token", 64), field(body, "password", 128));
      case "reauthenticate": return reauthenticate(request.headers, field(body, "password", 128));
      case "invite": return inviteStaff(request.headers, { email: field(body, "email"), name: field(body, "name", 100), username: field(body, "username", 30) });
      case "reset-owner": return requestOwnerReset(field(body, "email"));
      case "reset-staff": return requestStaffReset(request.headers, uuid(field(body, "operatorId", 36)));
      case "disable": return disableStaff(request.headers, uuid(field(body, "operatorId", 36)));
      case "capabilities": {
        if (typeof body.canManageMembers !== "boolean" || typeof body.canCollectCash !== "boolean") throw new IdentityError(400, "Choose explicit staff permissions.");
        return setCapabilities(request.headers, uuid(field(body, "operatorId", 36)), { canManageMembers: body.canManageMembers, canCollectCash: body.canCollectCash });
      }
    }
  });
}
export { handle as GET, handle as POST };

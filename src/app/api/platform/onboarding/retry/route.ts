import { apiResponse, readBody } from "@/lib/http";
import { onboardingRetrySchema } from "@/lib/onboarding-schema";
import { IdentityError } from "@/lib/identity";
import { retryOnboardingInvitation } from "@/lib/onboarding";

export async function POST(request: Request) {
  return apiResponse(request, async () => {
    const parsed = onboardingRetrySchema.safeParse(await readBody(request));
    if (!parsed.success) throw new IdentityError(400, "Check the invitation request.");
    return retryOnboardingInvitation(request.headers, parsed.data.requestId);
  });
}

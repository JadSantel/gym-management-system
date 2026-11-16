import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { submitOnboardingRequest } from "@/lib/onboarding";

export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "onboarding-request", 5, true);
    return submitOnboardingRequest(await readBody(request));
  });
}

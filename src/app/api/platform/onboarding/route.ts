import { apiResponse, readBody } from "@/lib/http";
import { decideOnboardingRequest, listOnboardingRequests } from "@/lib/onboarding";

export async function GET(request: Request) {
  return apiResponse(request, () => listOnboardingRequests(request.headers));
}

export async function POST(request: Request) {
  return apiResponse(request, () => readBody(request).then(body => decideOnboardingRequest(request.headers, body)));
}

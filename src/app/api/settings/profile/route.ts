import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { updateGymProfile } from "@/lib/gym-profile";

export async function POST(request: Request) {
  return apiResponse(request, async () => {
    await rateLimit(request.headers, "gym-profile");
    return updateGymProfile(request.headers, await readBody(request));
  });
}

import { memberDirectory } from "@/lib/members";
import { apiResponse } from "@/lib/http";

export async function GET(request: Request) {
  return apiResponse(request, () => memberDirectory(request.headers));
}

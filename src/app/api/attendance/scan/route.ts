import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { scanAttendance } from "@/lib/attendance";
export async function POST(request: Request) {
  return apiResponse(request, async () => { await rateLimit(request.headers, "attendance-scan", 120); return scanAttendance(request.headers, await readBody(request)); });
}

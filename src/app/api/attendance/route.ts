import { apiResponse, rateLimit, readBody } from "@/lib/http";
import { attendanceHistory, correctVisit } from "@/lib/attendance";
export async function GET(request: Request) {
  return apiResponse(request, () => {
    const params = new URL(request.url).searchParams;
    return attendanceHistory(request.headers, Object.fromEntries([...params.keys()].map(key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)])));
  });
}
export async function POST(request: Request) {
  return apiResponse(request, async () => { await rateLimit(request.headers, "attendance-correction"); return correctVisit(request.headers, await readBody(request)); });
}

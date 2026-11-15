import { apiResponse, rateLimit } from "@/lib/http";
import { attendanceCsv } from "@/lib/reports";

export async function GET(request: Request) {
  const response = await apiResponse(request, async () => {
    await rateLimit(request.headers, "attendance-export", 10);
    const params = new URL(request.url).searchParams;
    return attendanceCsv(request.headers, Object.fromEntries([...params.keys()].map(key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)])));
  });
  if (!response.ok) return response;
  const { csv, from, to } = await response.json();
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/csv; charset=utf-8");
  headers.set("content-disposition", `attachment; filename="attendance-${from}-to-${to}.csv"`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(csv, { headers });
}

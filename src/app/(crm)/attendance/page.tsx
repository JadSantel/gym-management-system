import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { attendanceHistory } from "@/lib/attendance";
import { IdentityError } from "@/lib/identity";
import { AttendanceHistory } from "@/components/attendance-history";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = await searchParams;
  const result = await attendanceHistory(await headers(), { pageSize: "10", ...filters }).catch(error => {
    if (error instanceof IdentityError) { if (error.status === 400) return { error: error.message }; redirect("/"); }
    throw error;
  });
  if ("error" in result) return <section className="panel" role="alert"><h1>Check attendance filters</h1><p className="my-4">{result.error}</p><Link href="/attendance" className="action-link">Reset to today</Link></section>;
  return <AttendanceHistory key={`${result.from}:${result.to}:${result.member}:${result.view}:${result.pageSize}`} data={result} />;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { inGym } from "@/lib/tenant";
import { IdentityError } from "@/lib/identity";
import { AttendanceScanner } from "@/components/attendance-scanner";
import { RegistrationLink } from "@/components/registration-link";
import { registrationLink } from "@/lib/registration";
export const dynamic = "force-dynamic";
export default async function ScannerPage() {
  await inGym(await headers(), "MEMBERS", async () => true).catch(error => { if (error instanceof IdentityError) redirect("/"); throw error; });
  const link = await registrationLink(await headers());
  return <><div className="page-heading"><div><Link href="/attendance" className="text-link">Back to attendance</Link><h1 className="mt-3">Attendance scanner</h1><p>Confirm arrivals and departures from the current server state.</p></div><a href="#registration-link" className="action-link">New member QR</a></div><AttendanceScanner /><RegistrationLink initial={link} /></>;
}

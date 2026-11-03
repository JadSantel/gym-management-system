"use client";
import { Button } from "@/components/ui/button";
export default function AttendanceError({ reset }: { reset: () => void }) {
  return <section className="panel" role="alert"><h1>Attendance could not load</h1><p className="my-4">Try again when connected. Check history before repeating an uncertain scan.</p><Button onClick={reset}>Try again</Button></section>;
}

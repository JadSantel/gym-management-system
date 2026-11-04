"use client";
import { Button } from "@/components/ui/button";
export default function AttendanceError({ reset }: { reset: () => void }) {
  return <section role="alert" className="panel"><h1 className="text-xl font-semibold">Attendance could not be loaded</h1><p className="my-4 text-sm text-muted-foreground">Retry to see recorded visits and the latest occupancy snapshot.</p><Button onClick={reset}>Retry attendance</Button></section>;
}

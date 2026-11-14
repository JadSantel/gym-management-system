"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { Download } from "lucide-react";
import { Button } from "./ui/button";

export function ReportTabs({ value, children }: { value: string; children: React.ReactNode }) {
  const router = useRouter(), params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return <Tabs.Root value={value} activationMode="manual" onValueChange={tab => {
    const next = new URLSearchParams(params); next.set("tab", tab); next.delete("page");
    startTransition(() => router.push(`/reports?${next}`, { scroll: false }));
  }}>
    <Tabs.List aria-label="Report categories" className="mb-6 inline-flex max-w-full gap-1 rounded-lg bg-muted p-1">
      {["members", "revenue", "attendance"].map(tab => <Tabs.Trigger key={tab} value={tab}
        className="min-h-11 rounded-md px-3 text-sm font-medium capitalize text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground sm:px-5">{tab}</Tabs.Trigger>)}
    </Tabs.List>
    <p className="sr-only" role="status">{pending ? "Updating reports…" : ""}</p>
    <Tabs.Content value={value} tabIndex={0} className="space-y-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-busy={pending}>{children}</Tabs.Content>
  </Tabs.Root>;
}

export function ExportAttendance({ from, to }: { from: string; to: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const failureMessage = "CSV export could not be completed. Try Export CSV again.";
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reports/attendance?${new URLSearchParams({ from, to })}`);
      if (!response.ok) { const body = await response.json(); setError(typeof body.error === "string" ? body.error : failureMessage); return; }
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `attendance-${from}-to-${to}.csv`; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(failureMessage); }
    finally { setBusy(false); }
  }
  return <div><Button id="attendance-export" type="button" onClick={download} disabled={busy}><Download aria-hidden="true" />{busy ? "Preparing export…" : "Export CSV"}</Button>
    <span className="sr-only" role="status">{busy ? "Preparing attendance export." : ""}</span>
    {error && <p role="alert" className="mt-2 max-w-sm text-sm text-destructive">{error}</p>}
  </div>;
}

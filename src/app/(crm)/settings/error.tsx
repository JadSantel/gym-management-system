"use client";
import { Button } from "@/components/ui/button";

export default function SettingsError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Unable to load settings</h2><p className="text-sm text-muted-foreground">Try again to review the current gym details.</p><Button variant="outline" onClick={reset}>Try again</Button></section>;
}

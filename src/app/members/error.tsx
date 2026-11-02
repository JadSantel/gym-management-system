"use client";
import { Button } from "@/components/ui/button";

export default function MembersError({ reset }: { reset: () => void }) {
  return <section role="alert" className="panel"><h1 className="text-xl font-semibold">Members could not be loaded</h1><p className="my-4 text-sm text-muted-foreground">Retry to load member records and membership counts.</p><Button onClick={reset}>Retry members</Button></section>;
}

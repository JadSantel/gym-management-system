"use client";
import { Button } from "@/components/ui/button";
export default function MemberError({ reset }: { reset: () => void }) {
  return <section className="panel mx-auto max-w-xl" role="alert"><h1 className="text-xl font-semibold">Member page could not load</h1><p className="my-4">Try again, or ask reception to review your member access.</p><Button onClick={reset}>Try again</Button></section>;
}

"use client";
import { Button } from "@/components/ui/button";
export default function JoinError({ reset }: { reset: () => void }) {
  return <section className="panel mx-auto max-w-xl" role="alert"><h1>Registration could not load</h1><p className="my-4">Try again, or ask reception to help with your profile.</p><Button onClick={reset}>Try again</Button></section>;
}

"use client";
import { Button } from "@/components/ui/button";

export default function PaymentHistoryError({ reset }: { reset: () => void }) {
  return <section role="alert" className="panel"><h1 className="text-xl font-semibold">Payment history could not be loaded</h1><p className="my-4 text-sm text-muted-foreground">Retry loading this view to see recorded collections and receipts.</p><Button onClick={reset}>Retry payment history</Button></section>;
}

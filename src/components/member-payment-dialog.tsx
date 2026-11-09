"use client";
import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function MemberPaymentDialog({ initialOpen, children }: { initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  const content = useRef<HTMLDivElement>(null);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button>Record payment</Button></DialogTrigger>
    <DialogContent ref={content} showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 sm:max-w-5xl" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (content.current?.querySelector('[aria-busy="true"]')) event.preventDefault(); }}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div><DialogTitle>Membership payment</DialogTitle><DialogDescription className="mt-1">Choose a plan and review the full charge before recording received funds.</DialogDescription></div>
        <DialogClose asChild><Button variant="outline" aria-label="Close membership payment" className="size-11 shrink-0 p-0" onClick={event => { if (event.currentTarget.closest('[role="dialog"]')?.querySelector('[aria-busy="true"]')) event.preventDefault(); }}><X className="size-4" aria-hidden="true" /></Button></DialogClose>
      </div>
      {children}
    </DialogContent>
  </Dialog>;
}

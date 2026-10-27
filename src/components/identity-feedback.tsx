"use client";
import { useEffect, useRef } from "react";

export type IdentityFeedbackState = { message: string; error: boolean };
export function IdentityFeedback({ id, feedback, links = [] }: {
  id: string; feedback: IdentityFeedbackState; links?: { id: string; label: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (feedback.error) ref.current?.focus(); }, [feedback]);
  return <div id={id} ref={ref} tabIndex={-1} role={feedback.error ? "alert" : "status"}
    className={`text-sm outline-offset-4 empty:hidden ${feedback.message ? "rounded-lg border border-border p-4" : ""} ${feedback.error ? "text-destructive" : "text-success"}`}>
    {feedback.message}
    {links.length > 0 && <ul className="mt-2 space-y-1">{links.map(link => <li key={link.id}>
      <a href={`#${link.id}`} className="underline" onClick={event => {
        event.preventDefault(); document.getElementById(link.id)?.focus();
      }}>{link.label}</a>
    </li>)}</ul>}
  </div>;
}

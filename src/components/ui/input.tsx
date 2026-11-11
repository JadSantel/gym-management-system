import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn("flex min-h-11 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-input/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-60 aria-invalid:border-destructive", className)} {...props} />;
}

import Link from "next/link";
import { WorkspaceIcon } from "@/components/workspace-icon";

// Page composition from shadcn/ui login-03 and signup-03 (radix-nova).
export function AuthPageFrame({ children, platform = false }: { children: React.ReactNode; platform?: boolean }) {
  return <div className="flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Link href="/login" className="flex items-center gap-2 self-center rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"><WorkspaceIcon name="shield" className="size-4" /></span>
        Form &amp; Function{platform && <span className="sr-only"> platform administration</span>}
      </Link>
      {children}
    </div>
  </div>;
}

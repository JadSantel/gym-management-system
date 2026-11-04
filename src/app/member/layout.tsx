import { MemberShell } from "@/components/member-shell";
export const metadata = { title: "Member area", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function MemberLayout({ children }: { children: React.ReactNode }) { return <MemberShell>{children}</MemberShell>; }

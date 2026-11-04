import { MemberShell } from "@/components/member-shell";

export default function MemberRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell registration>{children}</MemberShell>;
}

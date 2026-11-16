import { ThemeControl } from "@/components/theme-control";
import { AuthPageFrame } from "@/components/auth-page-frame";
import { PlatformLoginForm } from "@/components/platform-login-form";

export default function PlatformLoginPage() {
  return <main id="main" className="relative min-h-svh"><div className="absolute right-4 top-4 z-10"><ThemeControl /></div><AuthPageFrame platform><PlatformLoginForm /></AuthPageFrame></main>;
}

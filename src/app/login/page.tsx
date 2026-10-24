import { LoginForm } from "@/components/login-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ signedOut?: string }> }) {
  return <LoginForm signedOut={(await searchParams).signedOut === "true"} />;
}

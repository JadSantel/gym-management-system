import { LoginForm } from "@/components/login-form";
import { loginQuerySchema } from "@/lib/route-schema";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ signedOut?: string | string[] }> }) {
  const query = loginQuerySchema.safeParse({ signedOut: (await searchParams).signedOut });
  return <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center"><LoginForm signedOut={query.success && query.data.signedOut === "true"} /></div>;
}

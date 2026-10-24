import "server-only";
import { z } from "zod";

const runtimeConfigSchema = z.object({
  DATABASE_URL: z.string().refine(value => {
    if (!URL.canParse(value) || /\s/.test(value)) return false;
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1"
      && url.port === "55432" && url.pathname === "/gym_crm_synthetic"
      && !!url.username && !!url.password && !url.search && !url.hash;
  }),
  BETTER_AUTH_SECRET: z.string().min(32).refine(value => value.trim() === value
    && value !== "REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES"),
  BETTER_AUTH_URL: z.string().refine(value => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname === "127.0.0.1" && value === url.origin;
  }),
  // Hosted/live mode remains closed until its separately authorized readiness gates pass.
  SYNTHETIC_DATA_ONLY: z.literal("true"),
});

export function getRuntimeConfig(environment: Readonly<Record<string, unknown>> = process.env) {
  const parsed = runtimeConfigSchema.safeParse(environment);
  if (!parsed.success) {
    // Never attach the Zod error/input: URL credentials and auth secrets may be present.
    const keys = [...new Set(parsed.error.issues.map(issue => issue.path[0]))];
    throw new Error(`Invalid runtime configuration: ${keys.join(", ")}.`);
  }
  return parsed.data;
}

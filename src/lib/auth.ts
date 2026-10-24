import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { db } from "./db";
import { identityBinding } from "./binding";
import { assertSynthetic } from "./email";
import { getRuntimeConfig } from "./config";

const config = getRuntimeConfig();
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  // Until deployed ingress is verified, ignore all caller-supplied IP headers.
  // An empty list preserves the provider's shared fallback limiter; disabling
  // IP tracking would disable that limiter in Better Auth 1.7.12.
  advanced: { trustedProxyHeaders: false, ipAddress: { ipAddressHeaders: [] } },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    freshAge: 5 * 60,
    cookieCache: { enabled: false },
    additionalFields: { reauthenticatedAt: { type: "date", required: false, input: false, returned: false } },
  },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30,
    customRules: { "/sign-in/*": { window: 60, max: 5 } } },
  plugins: [username()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      try { assertSynthetic(); } catch { throw new APIError("SERVICE_UNAVAILABLE", { message: "Deployment proxy trust has not been verified." }); }
      if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-in/username") return;
      const emailMode = ctx.path === "/sign-in/email";
      const identifier = emailMode ? ctx.body?.email : ctx.body?.username;
      const user = typeof identifier === "string" ? await db.user.findFirst({
        where: emailMode ? { email: identifier.toLowerCase() } : { username: identifier.toLowerCase() },
      }) : null;
      const operator = user ? await identityBinding(user.id) : null;
      if (!operator || !user?.emailVerified || operator.state !== "ACTIVE" || operator.gym.state !== "ACTIVE"
          || operator.role !== (emailMode ? "OWNER" : "STAFF")) {
        // Match provider password work so inactive/unknown identities do not get a fast failure path.
        await ctx.context.password.hash(typeof ctx.body?.password === "string" ? ctx.body.password : "invalid-password");
        throw new APIError("UNAUTHORIZED", { message: "Unable to sign in. Check your credentials or contact your owner." });
      }
    }),
  },
  databaseHooks: {
    session: { create: { before: async (session) => {
      const operator = await identityBinding(session.userId);
      if (!operator || operator.state !== "ACTIVE" || operator.gym.state !== "ACTIVE" || !operator.user.emailVerified) return false;
      return { data: session };
    } } },
  },
});

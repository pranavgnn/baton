import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  sendAccountInviteEmail,
  sendPasswordResetEmail,
} from "@/lib/mail/system";

const RESET_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export const auth = betterAuth({
  appName: "MIT Promotion Application Portal",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    /**
     * The portal is whitelist-only: accounts are provisioned by admins, never
     * self-registered. The seed script and the admin user form call the server
     * API directly, which bypasses this flag.
     */
    disableSignUp: true,
    requireEmailVerification: false,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user: authUser, url }) => {
      // The same token powers both onboarding and genuine password resets; the
      // copy differs so an invitee is not told to "reset" a password they never
      // had.
      const isActivated =
        (authUser as { activated?: boolean }).activated === true;
      const send = isActivated
        ? sendPasswordResetEmail
        : sendAccountInviteEmail;

      await send({
        to: authUser.email,
        name: authUser.name || authUser.email,
        url,
        expiresInHours: RESET_TOKEN_TTL_SECONDS / 3600,
      });
    },
    /**
     * Completing a reset is what activates a provisioned account, which is the
     * onboarding path described in the portal spec.
     */
    onPasswordReset: async ({ user: authUser }) => {
      await db
        .update(schema.user)
        .set({ activated: true, emailVerified: true })
        .where(eq(schema.user.id, authUser.id));
    },
  },

  user: {
    additionalFields: {
      employeeId: { type: "string", required: false, input: false },
      department: { type: "string", required: false, input: false },
      designation: { type: "string", required: false, input: false },
      activated: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      disabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type AuthSession = Auth["$Infer"]["Session"];

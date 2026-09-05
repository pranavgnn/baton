import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  sendAccountInviteEmail,
  sendPasswordResetEmail,
} from "@/lib/mail/system";

import { ADMIN_ROLE, NON_ADMIN_ROLE } from "@/lib/auth/admin-flag";

const RESET_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export const auth = betterAuth({
  appName: "Baton",
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

      await recordAudit({
        action: "auth.reset_requested",
        actor: {
          id: authUser.id,
          name: authUser.name || authUser.email,
          email: authUser.email,
        },
        summary: isActivated
          ? `A password reset link was sent to ${authUser.email}.`
          : `An activation link was sent to ${authUser.email}.`,
        targetType: "user",
        targetId: authUser.id,
        targetLabel: authUser.email,
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

      await recordAudit({
        action: "auth.password_reset",
        actor: {
          id: authUser.id,
          name: authUser.name || authUser.email,
          email: authUser.email,
        },
        summary: `${authUser.email} set a new password from an emailed link.`,
        targetType: "user",
        targetId: authUser.id,
        targetLabel: authUser.email,
      });
    },
  },

  user: {
    additionalFields: {
      employeeId: { type: "string", required: false, input: false },
      departmentId: { type: "string", required: false, input: false },
      designation: { type: "string", required: false, input: false },
      /*
       * The particulars in `lib/users/profile.ts`. Declared here because
       * provisioning goes through Better Auth's own adapter, which drops any
       * column it has not been told about. None is writable from the browser.
       */
      institution: { type: "string", required: false, input: false },
      userType: { type: "string", required: false, input: false },
      dateOfBirth: { type: "string", required: false, input: false },
      dateOfJoining: { type: "string", required: false, input: false },
      phone: { type: "string", required: false, input: false },
      personalEmail: { type: "string", required: false, input: false },
      address: { type: "string", required: false, input: false },
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

  hooks: {
    /**
     * Sign-in is the one access event the portal never sees for itself: the
     * browser talks straight to Better Auth. The new session is on the context
     * once the endpoint has run, which is who to credit. Signing out and
     * changing a password are recorded in `lib/audit/session.ts`, where there
     * is still - or again - a session to identify.
     */
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/sign-in")) return;

      const session = ctx.context.newSession;
      if (!session) return;

      await recordAudit({
        action: "auth.signed_in",
        actor: {
          id: session.user.id,
          name: session.user.name || session.user.email,
          email: session.user.email,
        },
        summary: `${session.user.name || session.user.email} signed in.`,
        targetType: "user",
        targetId: session.user.id,
        targetLabel: session.user.email,
      });
    }),
  },

  plugins: [
    /**
     * Impersonation, and nothing else the plugin offers.
     *
     * It swaps the session itself rather than dressing one up, so every query,
     * queue and permission check downstream sees the impersonated person
     * without knowing anything about impersonation. Who counts as an admin is
     * `user.role`, which the portal derives from its own permissions in
     * `lib/auth/admin-flag.ts` - the roles that matter are still the ones in
     * `user_role`.
     */
    admin({
      adminRoles: [ADMIN_ROLE],
      defaultRole: NON_ADMIN_ROLE,
      impersonationSessionDuration: 60 * 60,
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type AuthSession = Auth["$Infer"]["Session"];

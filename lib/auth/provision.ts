import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/**
 * The portal has no public sign-up: accounts are provisioned by admins and the
 * invitee activates them through the password-reset flow. Better Auth's public
 * sign-up endpoint is disabled, so provisioning goes through the internal
 * adapter - the same path the official admin plugin uses.
 */
export type ProvisionUserInput = {
  email: string;
  name: string;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  /** Only supplied by the seed script; invitees choose their own. */
  password?: string;
  activated?: boolean;
};

export type ProvisionedUser = { id: string; email: string; created: boolean };

export async function provisionUser(
  input: ProvisionUserInput,
): Promise<ProvisionedUser> {
  const email = input.email.trim().toLowerCase();
  const context = await auth.$context;

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (existing) {
    return { id: existing.id, email: existing.email, created: false };
  }

  const created = await context.internalAdapter.createUser({
    email,
    name: input.name.trim(),
    emailVerified: false,
    employeeId: input.employeeId ?? null,
    department: input.department ?? null,
    designation: input.designation ?? null,
    activated: input.activated ?? false,
    disabled: false,
  });

  // A credential account must exist for password sign-in and password reset to
  // work. Invitees get an unguessable placeholder they can never use; the
  // activation email is the only way in.
  const password = input.password ?? crypto.randomUUID() + crypto.randomUUID();
  await context.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await context.password.hash(password),
  });

  return { id: created.id, email: created.email, created: true };
}

/**
 * Sends the activation / reset email. The copy is chosen inside the auth
 * config based on whether the account has been activated yet.
 */
export async function sendActivationLink(email: string): Promise<void> {
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
}

"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit/record";

/**
 * Ends the session, recording who it belonged to first.
 *
 * Signing out has to be recorded before it happens: afterwards there is no
 * session left to say whose it was. Routing it through here rather than
 * calling the auth client directly also means the identity in the record is
 * the server's own, not the browser's claim about it.
 */
export async function signOutAndRecord(): Promise<void> {
  const current = await getCurrentUser();

  if (current) {
    await recordAudit({
      action: "auth.signed_out",
      actor: current,
      summary: `${current.name} signed out.`,
      targetType: "user",
      targetId: current.id,
      targetLabel: current.email,
    });
  }

  await auth.api.signOut({ headers: await headers() });
}

/**
 * Records a password change the account holder made themselves.
 *
 * Better Auth handles the change over its own endpoint, so this runs after the
 * fact - but the actor is still resolved from the session on the server, so a
 * client cannot claim to be somebody else.
 */
export async function recordPasswordChanged(): Promise<void> {
  const current = await getCurrentUser();
  if (!current) return;

  await recordAudit({
    action: "auth.password_changed",
    actor: current,
    summary: `${current.name} changed their own password.`,
    targetType: "user",
    targetId: current.id,
    targetLabel: current.email,
  });
}

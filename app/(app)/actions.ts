"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { failFrom, ok, type ActionResult } from "@/lib/actions";
import { recordAudit } from "@/lib/audit/record";
import { auth } from "@/lib/auth";
import { applyAuthCookies } from "@/lib/auth/cookies";
import { getCurrentUser, getRealUser } from "@/lib/auth/session";

/**
 * Hands the session back to the administrator behind it.
 *
 * Deliberately open to whoever holds the impersonated session rather than
 * gated on a permission: a person must always be able to stop being somebody
 * else, including an administrator whose own permissions were taken away while
 * they were away from their account.
 */
export async function stopImpersonating(): Promise<ActionResult> {
  try {
    const current = await getCurrentUser();
    if (!current?.impersonatedBy) return ok();

    const real = await getRealUser();
    const restored = await auth.api.stopImpersonating({
      headers: await headers(),
      asResponse: true,
    });
    await applyAuthCookies(restored);

    await recordAudit({
      action: "user.impersonation_ended",
      actor: real,
      summary: `${current.impersonatedBy.name} stopped acting as ${current.name} (${current.email}).`,
      targetType: "user",
      targetId: current.id,
      targetLabel: current.email,
    });

    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

import { PERMISSIONS, SUPER_ADMIN_PERMISSION } from "./permissions";

/**
 * Signing in as somebody else to see what they see.
 *
 * Better Auth's admin plugin does the session swap; these are the rules it has
 * no opinion about. An administrator may look through another person's eyes,
 * but never through eyes that hold administrative power theirs do not - or
 * anyone who can manage users could act as a super admin and quietly become
 * one.
 */

/** The shape either side of an impersonation is judged on. */
export type ImpersonationParty = {
  id: string;
  disabled: boolean;
  permissions: readonly string[];
};

export type ImpersonationRefusal =
  "self" | "disabled" | "privileged" | "not-permitted";

/**
 * Permissions that administer the portal rather than use it.
 *
 * These are the escalation surface, and the only ones the rule below compares.
 * Requiring the whole set to match instead would defeat the feature: an
 * administrator who cannot submit an application would be unable to act as the
 * applicant whose form they are trying to see, which is what it is for.
 */
const PRIVILEGED_PERMISSIONS: readonly string[] = PERMISSIONS.filter(
  (permission) => permission.group !== "Applications",
).map((permission) => permission.key);

/** Whether `actor` may act as `target`, or why not. */
export function refuseImpersonation(
  actor: ImpersonationParty,
  target: ImpersonationParty,
): ImpersonationRefusal | null {
  if (actor.id === target.id) return "self";
  if (target.disabled) return "disabled";
  if (!coversPrivileges(actor.permissions, target.permissions)) {
    return "privileged";
  }
  return null;
}

/**
 * True when every administrative permission the target holds, the actor holds
 * too. The wildcard covers everything and can be covered by nothing else.
 */
export function coversPrivileges(
  actor: readonly string[],
  target: readonly string[],
): boolean {
  if (actor.includes(SUPER_ADMIN_PERMISSION)) return true;
  if (target.includes(SUPER_ADMIN_PERMISSION)) return false;

  return target
    .filter((permission) => PRIVILEGED_PERMISSIONS.includes(permission))
    .every((permission) => actor.includes(permission));
}

export function refusalMessage(reason: ImpersonationRefusal): string {
  switch (reason) {
    case "self":
      return "You are already signed in as yourself.";
    case "disabled":
      return "That account is disabled. Re-enable it first if you need to see what they see.";
    case "privileged":
      return "That account administers the portal in ways you cannot, so you may not act as them.";
    case "not-permitted":
      return "You do not have permission to act as another user.";
  }
}

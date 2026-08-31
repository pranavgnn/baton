/**
 * Permission vocabulary. Roles themselves are fully dynamic (admins create and
 * rename them from the UI); what is fixed is the set of capabilities a role can
 * be granted.
 */
export const PERMISSIONS = [
  {
    key: "admin.access",
    label: "Access admin area",
    group: "Administration",
    description: "See the admin navigation and dashboard.",
  },
  {
    key: "users.manage",
    label: "Manage users",
    group: "Administration",
    description: "Provision accounts, assign roles, disable access.",
  },
  {
    key: "roles.manage",
    label: "Manage roles",
    group: "Administration",
    description: "Create, rename and delete roles and their permissions.",
  },
  {
    key: "workflow.manage",
    label: "Manage workflow",
    group: "Configuration",
    description: "Edit and publish the promotion workflow.",
  },
  {
    key: "templates.manage",
    label: "Manage email templates",
    group: "Configuration",
    description: "Create and edit the templates used by email nodes.",
  },
  {
    key: "applications.apply",
    label: "Submit applications",
    group: "Applications",
    description: "Start and submit a promotion application.",
  },
  {
    key: "applications.review",
    label: "Review applications",
    group: "Applications",
    description: "Act on stages assigned to the role.",
  },
  {
    key: "applications.viewAll",
    label: "View all applications",
    group: "Applications",
    description: "Read every application regardless of stage assignment.",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

/** Wildcard held by the seeded Super Admin role. */
export const SUPER_ADMIN_PERMISSION = "*" as const;

export const PERMISSION_GROUPS = Array.from(
  new Set(PERMISSIONS.map((p) => p.group)),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(value);
}

/**
 * Grants are stored as an array of permission keys, optionally containing the
 * `*` wildcard.
 */
export function grants(
  held: readonly string[],
  required: PermissionKey,
): boolean {
  return held.includes(SUPER_ADMIN_PERMISSION) || held.includes(required);
}

export function grantsAny(
  held: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  if (held.includes(SUPER_ADMIN_PERMISSION)) return true;
  return required.some((key) => held.includes(key));
}

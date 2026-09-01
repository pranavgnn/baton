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
    label: "Manage the workflow",
    group: "Configuration",
    description:
      "Add, remove and rewire steps, and publish the workflow. Includes editing forms.",
  },
  {
    key: "forms.manage",
    label: "Edit forms",
    group: "Configuration",
    description:
      "Change the questions on any existing step, without being able to alter the flow itself.",
  },
  {
    key: "templates.manage",
    label: "Manage email templates",
    group: "Configuration",
    description: "Create and edit the templates used by email nodes.",
  },
  {
    key: "audit.view",
    label: "View the audit log",
    group: "Administration",
    description: "Read and export the record of who did what, and when.",
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

/**
 * Editing a step's questions is implied by being able to rewire the workflow -
 * an admin who can delete the step entirely is not meaningfully restrained by
 * being kept out of its form.
 */
export function canEditForms(held: readonly string[]): boolean {
  return grants(held, "forms.manage") || grants(held, "workflow.manage");
}

export function grantsAny(
  held: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  if (held.includes(SUPER_ADMIN_PERMISSION)) return true;
  return required.some((key) => held.includes(key));
}

/** What a role row may store: a permission key or the Super Admin wildcard. */
export type RolePermission = PermissionKey | typeof SUPER_ADMIN_PERMISSION;

/**
 * Standing posts an organisation recognises, and the role that carries each.
 *
 * Roles themselves are fully dynamic - an admin may rename "Deputy" to
 * whatever this organisation actually calls it - so nothing may key off a
 * role's name. A designation is the stable handle instead: the admin says once
 * which role means "head", and departments, the workflow and the automatic
 * grants all read that. At most one role may carry a given designation.
 */
export const ROLE_DESIGNATIONS = [
  {
    key: "head",
    label: "Head of a department",
    description:
      "Given automatically to whoever is named head of a department, and taken away when they are no longer head of any.",
  },
  {
    key: "deputy",
    label: "Deputy head of a department",
    description:
      "Given automatically to the deputies of a department, and taken away when they hold no such post.",
  },
] as const;

export type RoleDesignation = (typeof ROLE_DESIGNATIONS)[number]["key"];

export const ROLE_DESIGNATION_KEYS = ROLE_DESIGNATIONS.map(
  (item) => item.key,
) as RoleDesignation[];

export function designationLabel(key: string): string {
  return ROLE_DESIGNATIONS.find((item) => item.key === key)?.label ?? key;
}

/** Designations whose holders a department posting decides, not an admin. */
export const DEPARTMENT_DESIGNATIONS = ["head", "deputy"] as const;

/**
 * How a user came to hold a role. A role a department posting granted is taken
 * back when the posting ends; one granted by hand is left alone, because an
 * admin meant it.
 */
export const ROLE_GRANT_SOURCES = ["manual", "department"] as const;
export type RoleGrantSource = (typeof ROLE_GRANT_SOURCES)[number];

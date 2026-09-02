/**
 * Standing posts the institute recognises, and the role that carries each.
 *
 * Roles themselves are fully dynamic - an admin may rename "Associate Dean" to
 * anything the institute actually calls it - so nothing may key off a role's
 * name. A designation is the stable handle instead: the admin says once which
 * role means "dean", and schools, the workflow and the auto-assignment all
 * read that. At most one role may carry a given designation.
 */
export const ROLE_DESIGNATIONS = [
  {
    key: "dean",
    label: "Dean of a school",
    description:
      "Given automatically to whoever is named dean of a school, and taken away when they are no longer dean of any.",
  },
  {
    key: "associate_dean",
    label: "Associate dean of a school",
    description:
      "Given automatically to the associate deans of a school, and taken away when they hold no such post.",
  },
] as const;

export type RoleDesignation = (typeof ROLE_DESIGNATIONS)[number]["key"];

export const ROLE_DESIGNATION_KEYS = ROLE_DESIGNATIONS.map(
  (item) => item.key,
) as RoleDesignation[];

export function designationLabel(key: string): string {
  return ROLE_DESIGNATIONS.find((item) => item.key === key)?.label ?? key;
}

/** Designations whose holders are decided by a school posting, not by hand. */
export const SCHOOL_DESIGNATIONS = ["dean", "associate_dean"] as const;

/**
 * How a user came to hold a role. A role granted by a school posting is taken
 * back when the posting ends; one granted by hand is left alone, because an
 * admin meant it.
 */
export const ROLE_GRANT_SOURCES = ["manual", "school"] as const;
export type RoleGrantSource = (typeof ROLE_GRANT_SOURCES)[number];

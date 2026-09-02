/**
 * Everything the portal knows about a person, as one list.
 *
 * It is the single vocabulary behind three screens that would otherwise drift
 * apart: the columns a CSV import can be mapped onto, the fields the admin
 * edits by hand, and the answers a form may prefill from the account. Adding
 * an attribute here is most of the work of supporting it everywhere.
 */

export const USER_TYPES = [
  {
    key: "regular",
    label: "Regular",
    description: "On the institute's permanent rolls.",
  },
  {
    key: "contract",
    label: "Contract",
    description: "Appointed for a fixed term.",
  },
  {
    key: "probation",
    label: "Probation",
    description: "Serving a probationary period.",
  },
] as const;

export type UserType = (typeof USER_TYPES)[number]["key"];
export const USER_TYPE_KEYS = USER_TYPES.map((type) => type.key) as UserType[];

export function userTypeLabel(value: string | null | undefined): string {
  return USER_TYPES.find((type) => type.key === value)?.label ?? "-";
}

/**
 * Whether someone's employment lets them apply at all.
 *
 * A promotion is a move within the permanent rolls, so a fixed-term appointment
 * and a probationary period are not eligible for one - the institute's rule,
 * not the portal's invention. An account whose employment has never been
 * recorded is not barred: the portal not knowing something is not the same as
 * knowing it disqualifies them, and an import that missed a column must not
 * quietly stop people applying.
 */
export function promotionBar(
  userType: string | null | undefined,
): string | null {
  if (userType === "contract") {
    return "Employees appointed on contract are not eligible to apply for promotion.";
  }
  if (userType === "probation") {
    return "Employees serving a probationary period are not eligible to apply for promotion.";
  }
  return null;
}

/**
 * How a value is read and written.
 *
 * `school` and `roles` are matched by name against what the institute has
 * rather than stored as typed, which is why they are their own kinds.
 */
export type UserFieldKind =
  "text" | "email" | "date" | "choice" | "school" | "roles";

export type UserField = {
  key: string;
  label: string;
  kind: UserFieldKind;
  /** Header name matched when guessing a CSV mapping, alongside the label. */
  csv: string;
  /** Whether a row is worthless without it. Only the address is. */
  required?: boolean;
  /** Offered as a source a form field can be prefilled from. */
  prefillable?: boolean;
  hint?: string;
};

export const USER_FIELDS = [
  {
    key: "email",
    label: "Institute email",
    kind: "email",
    csv: "email",
    required: true,
    prefillable: true,
  },
  {
    key: "name",
    label: "Full name",
    kind: "text",
    csv: "name",
    prefillable: true,
    hint: "Taken from the address when a row leaves it blank.",
  },
  {
    key: "employeeId",
    label: "Employee code",
    kind: "text",
    csv: "employee_id",
    prefillable: true,
  },
  {
    key: "school",
    label: "School",
    kind: "school",
    csv: "school",
    prefillable: true,
    hint: "Matched by name against the schools the portal holds.",
  },
  {
    key: "designation",
    label: "Present designation",
    kind: "text",
    csv: "designation",
    prefillable: true,
  },
  {
    key: "institution",
    label: "Institution",
    kind: "text",
    csv: "institution",
    prefillable: true,
  },
  {
    key: "userType",
    label: "Employment type",
    kind: "choice",
    csv: "user_type",
    prefillable: true,
    hint: "Regular, contract or probation.",
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    kind: "date",
    csv: "date_of_birth",
    prefillable: true,
  },
  {
    key: "dateOfJoining",
    label: "Date of joining",
    kind: "date",
    csv: "date_of_joining",
    prefillable: true,
  },
  {
    key: "dateOfLastPromotion",
    label: "Date of last promotion",
    kind: "date",
    csv: "date_of_last_promotion",
    prefillable: true,
  },
  {
    key: "phone",
    label: "Contact number",
    kind: "text",
    csv: "phone",
    prefillable: true,
  },
  {
    key: "personalEmail",
    label: "Personal email",
    kind: "email",
    csv: "personal_email",
    prefillable: true,
  },
  {
    key: "address",
    label: "Postal address",
    kind: "text",
    csv: "address",
    prefillable: true,
  },
  {
    key: "roles",
    label: "Roles",
    kind: "roles",
    csv: "roles",
    hint: "Names as they appear in Roles, separated by ; or |.",
  },
] as const satisfies readonly UserField[];

export type UserFieldKey = (typeof USER_FIELDS)[number]["key"];

export const USER_FIELD_KEYS = USER_FIELDS.map(
  (field) => field.key,
) as UserFieldKey[];

/**
 * The same list, widened.
 *
 * `USER_FIELDS` is `as const` so the key type is exact, which also makes each
 * entry its own literal type without the optional properties. Anything that
 * only wants to walk the list reads this instead.
 */
export const USER_FIELD_LIST: readonly UserField[] = USER_FIELDS;

/** The attributes a form field may be prefilled from. */
export const PREFILL_SOURCES: readonly UserField[] = USER_FIELD_LIST.filter(
  (field) => field.prefillable,
);

export function userFieldLabel(key: string): string {
  return USER_FIELDS.find((field) => field.key === key)?.label ?? key;
}

/**
 * A date as written by a person, as an ISO day.
 *
 * Institute spreadsheets are full of `DD/MM/YYYY` - the form the paper version
 * asks for - so that is read first; an unambiguous ISO date is accepted as it
 * stands. Anything else is rejected rather than guessed at, because a date
 * silently read the American way round is worse than a row that fails.
 */
export function parseUserDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isRealDate(iso[1], iso[2], iso[3]) ? trimmed : null;

  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return isRealDate(dmy[3], month, day) ? `${dmy[3]}-${month}-${day}` : null;
  }

  return null;
}

function isRealDate(year: string, month: string, day: string): boolean {
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

/** Reads a written employment type, however it was capitalised. */
export function parseUserType(value: string): UserType | null {
  const needle = value.trim().toLowerCase();
  return USER_TYPE_KEYS.find((key) => key === needle) ?? null;
}

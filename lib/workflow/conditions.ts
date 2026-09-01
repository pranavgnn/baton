import type { AnyField, ConditionGroup, ConditionRule } from "./types";

/**
 * Whether a question applies, given the answers around it.
 *
 * The paper forms are full of questions that only apply sometimes - "date of
 * eligibility (if eligible)", "reason (if not eligible)", "patent certificate
 * (if item 10 is above zero)". A rule names another answer in the same scope:
 * a field of the same form, or a sibling column of the same entry.
 *
 * Kept free of React and of Zod so the rules can be exercised directly.
 */

export type ConditionScope = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** The same emptiness the validator uses, so the two never disagree. */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (value === false) return true;
  return false;
}

export function evaluateRule(rule: ConditionRule, scope: ConditionScope) {
  const value = scope[rule.field];

  switch (rule.operator) {
    case "equals":
      return Array.isArray(value)
        ? value.includes(rule.value)
        : String(value ?? "") === rule.value;

    case "notEquals":
      return Array.isArray(value)
        ? !value.includes(rule.value)
        : String(value ?? "") !== rule.value;

    case "isFilled":
      return !isBlank(value);

    case "isEmpty":
      return isBlank(value);

    case "isChecked":
      return value === true;

    case "isNotChecked":
      return value !== true;

    case "greaterThan": {
      const left = asNumber(value);
      const right = asNumber(rule.value);
      return left !== null && right !== null && left > right;
    }

    case "lessThan": {
      const left = asNumber(value);
      const right = asNumber(rule.value);
      return left !== null && right !== null && left < right;
    }
  }
}

/**
 * A group with no rules matches, so a half-built rule in the builder never
 * silently hides a question from every applicant.
 */
export function matchesConditions(
  group: ConditionGroup | null | undefined,
  scope: ConditionScope,
): boolean {
  if (!group || group.rules.length === 0) return true;

  return group.mode === "any"
    ? group.rules.some((rule) => evaluateRule(rule, scope))
    : group.rules.every((rule) => evaluateRule(rule, scope));
}

/** False when the field's own rule says it does not apply right now. */
export function isFieldVisible(
  field: AnyField,
  scope: ConditionScope,
): boolean {
  return matchesConditions(field.visibleWhen, scope);
}

/**
 * Whether an answer must be given right now.
 *
 * `requiredWhen` replaces the plain required flag rather than adding to it: a
 * question that is only sometimes required is not a required question.
 */
export function isFieldRequired(
  field: AnyField,
  scope: ConditionScope,
): boolean {
  if (!isFieldVisible(field, scope)) return false;
  if (field.requiredWhen) return matchesConditions(field.requiredWhen, scope);
  return field.required;
}

/** The other answers a field's rules depend on, without duplicates. */
export function conditionDependencies(field: AnyField): string[] {
  const rules = [
    ...(field.visibleWhen?.rules ?? []),
    ...(field.requiredWhen?.rules ?? []),
  ];
  return Array.from(new Set(rules.map((rule) => rule.field)));
}

export function hasConditions(field: AnyField): boolean {
  return conditionDependencies(field).length > 0;
}

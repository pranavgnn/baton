import { compileFormula, evaluateFormula, tidyNumber } from "./calc";
import { isFieldVisible } from "./conditions";
import { valueColumns } from "./form";
import {
  isRowArray,
  type AnyField,
  type FormSchema,
  type RowValue,
  type SectionData,
} from "./types";

/**
 * The two ways an answer can arrive without being typed: taken from the
 * applicant's own account, or worked out from the answers beside it.
 *
 * Both run in the browser so the form shows the right thing while it is being
 * filled in, and again on the server before anything is validated or stored -
 * a total the browser was talked into is still recomputed here, and a field
 * locked to the account is written from the account rather than from whatever
 * arrived.
 */

/** The account values a form may draw on, keyed as `lib/users/profile.ts` is. */
export type PrefillProfile = Record<string, string | null | undefined>;

/** Whether this field takes its answer from the account, and has one to take. */
export function isLockedByProfile(
  field: AnyField,
  profile: PrefillProfile | null | undefined,
): boolean {
  if (!field.prefill || !profile) return false;
  const value = profile[field.prefill];
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Writes account values over the answers they own.
 *
 * Only where the account actually has something: a blank record leaves the
 * question as it was, which is what keeps an applicant whose service record is
 * incomplete from being unable to submit.
 */
export function applyPrefill(
  form: FormSchema,
  data: SectionData,
  profile: PrefillProfile | null | undefined,
): SectionData {
  if (!profile) return data;

  const next = { ...data };
  for (const section of form.sections) {
    for (const field of section.fields) {
      if (!isLockedByProfile(field, profile)) continue;
      next[field.key] = (profile[field.prefill as string] ?? "") as string;
    }
  }
  return next;
}

/**
 * Recomputes every calculated answer, including the columns of a repeating
 * group, which are worked out against their own entry rather than the form.
 */
export function applyCalculations(
  form: FormSchema,
  data: SectionData,
): SectionData {
  const next = { ...data };

  for (const section of form.sections) {
    for (const field of section.fields) {
      if (field.type === "repeater") {
        const columns = valueColumns(field).filter((column) => column.formula);
        if (columns.length === 0) continue;

        const rows = isRowArray(next[field.key])
          ? (next[field.key] as RowValue[])
          : [];
        next[field.key] = rows.map((row) => {
          const entry: RowValue = { ...row };
          for (const column of columns) {
            entry[column.key] = computed(column, entry);
          }
          return entry;
        });
        continue;
      }

      if (!field.formula) continue;
      next[field.key] = computed(field, next);
    }
  }

  return next;
}

/** One field's value, or null when the formula cannot produce a number. */
export function computed(
  field: AnyField,
  scope: Record<string, unknown>,
): number | null {
  if (!field.formula) return null;
  // A question that does not apply is not answered, computed or otherwise.
  if (!isFieldVisible(field, scope)) return null;

  const compiled = compileFormula(field.formula);
  if (!compiled || "message" in compiled) return null;

  const value = evaluateFormula(compiled, scope);
  return value === null ? null : tidyNumber(value);
}

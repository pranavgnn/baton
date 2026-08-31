import { z } from "zod";

import {
  isDisplayField,
  type FileValue,
  type FormField,
  type FormSchema,
  type FormSection,
  type FormValue,
  type SectionData,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Field -> Zod                                                               */
/* -------------------------------------------------------------------------- */

const fileValueSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string(),
});

function optional<T extends z.ZodTypeAny>(schema: T) {
  return schema.optional().nullable();
}

/** Treats "" / null / undefined / [] as "nothing was entered". */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function buildFieldSchema(field: FormField): z.ZodTypeAny {
  const v = field.validation ?? {};
  const requiredMessage = `${field.label} is required`;

  switch (field.type) {
    case "text":
    case "textarea": {
      let schema = z.string();
      if (v.minLength != null) {
        schema = schema.min(
          v.minLength,
          `${field.label} must be at least ${v.minLength} characters`,
        );
      }
      if (v.maxLength != null) {
        schema = schema.max(
          v.maxLength,
          `${field.label} must be at most ${v.maxLength} characters`,
        );
      }
      if (v.pattern) {
        const regex = safeRegex(v.pattern);
        if (regex) {
          schema = schema.regex(
            regex,
            v.patternMessage || `${field.label} is not in the expected format`,
          );
        }
      }
      return field.required
        ? requiredString(schema, requiredMessage)
        : optionalString(schema);
    }

    case "email": {
      const schema = z.email(`${field.label} must be a valid email address`);
      return field.required
        ? requiredString(schema, requiredMessage)
        : optionalString(schema);
    }

    case "phone": {
      const schema = z
        .string()
        .regex(
          /^[+]?[0-9][0-9\s\-()]{6,19}$/,
          `${field.label} must be a valid phone number`,
        );
      return field.required
        ? requiredString(schema, requiredMessage)
        : optionalString(schema);
    }

    case "number": {
      let schema = z.number({
        error: (issue) =>
          issue.input === undefined
            ? requiredMessage
            : `${field.label} must be a number`,
      });
      if (v.min != null) {
        schema = schema.min(v.min, `${field.label} must be at least ${v.min}`);
      }
      if (v.max != null) {
        schema = schema.max(v.max, `${field.label} must be at most ${v.max}`);
      }

      // Number inputs hand back strings; blank means "not answered".
      const coerce = (value: unknown) => {
        if (value === "" || value === null || value === undefined)
          return undefined;
        if (typeof value === "string") {
          const parsed = Number(value.trim());
          return Number.isNaN(parsed) ? value : parsed;
        }
        return value;
      };

      return field.required
        ? z.preprocess(coerce, schema)
        : z.preprocess(coerce, schema.optional());
    }

    case "date": {
      const schema = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${field.label} must be a valid date`);
      return field.required
        ? requiredString(schema, requiredMessage)
        : optionalString(schema);
    }

    case "select":
    case "radio": {
      const allowed = field.options.map((option) => option.value);
      const schema = z
        .string()
        .refine(
          (value) => allowed.includes(value),
          `${field.label} must be one of the listed options`,
        );
      return field.required
        ? requiredString(schema, requiredMessage)
        : optionalString(schema);
    }

    case "multiselect": {
      const allowed = field.options.map((option) => option.value);
      const schema = z
        .array(z.string())
        .refine(
          (values) => values.every((value) => allowed.includes(value)),
          `${field.label} contains an option that is not available`,
        );
      return field.required
        ? z.preprocess((value) => value ?? [], schema.min(1, requiredMessage))
        : optional(schema.default([]));
    }

    case "checkbox": {
      return field.required
        ? z.preprocess(
            (value) => value ?? false,
            z.literal(true, { error: requiredMessage }),
          )
        : optional(z.boolean().default(false));
    }

    case "file": {
      const single = fileValueSchema.superRefine((file, ctx) => {
        if (
          v.maxFileSizeMb != null &&
          file.size > v.maxFileSizeMb * 1024 * 1024
        ) {
          ctx.addIssue({
            code: "custom",
            message: `${file.name} exceeds the ${v.maxFileSizeMb} MB limit`,
          });
        }
        if (
          v.acceptedFileTypes?.length &&
          !matchesAccept(file, v.acceptedFileTypes)
        ) {
          ctx.addIssue({
            code: "custom",
            message: `${file.name} is not an accepted file type`,
          });
        }
      });

      const multiple = (v.maxFiles ?? 1) > 1;
      if (multiple) {
        let list = z.array(single);
        if (v.maxFiles != null) {
          list = list.max(
            v.maxFiles,
            `${field.label} accepts at most ${v.maxFiles} files`,
          );
        }
        return field.required
          ? z.preprocess((value) => value ?? [], list.min(1, requiredMessage))
          : optional(list.default([]));
      }
      return field.required
        ? z.preprocess(
            (value) => value ?? null,
            single.nullable().refine((file) => file !== null, requiredMessage),
          )
        : optional(single);
    }

    case "heading":
    case "paragraph":
      return z.any().optional();
  }
}

function optionalString(schema: z.ZodTypeAny) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );
}

/**
 * Required text-like fields: missing, null and "" all mean "not answered", so
 * they are normalised to "" and gated by a single min(1) before any format
 * rule runs. Without this a field the user never touched reports Zod's raw
 * type error instead of "<Label> is required".
 */
function requiredString(schema: z.ZodTypeAny, requiredMessage: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z
      .string()
      .min(1, requiredMessage)
      .pipe(schema as z.ZodType<unknown, string>),
  );
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function matchesAccept(file: FileValue, accepted: string[]): boolean {
  const name = file.name.toLowerCase();
  return accepted.some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) {
      return file.contentType.startsWith(rule.slice(0, -1));
    }
    return file.contentType === rule;
  });
}

/* -------------------------------------------------------------------------- */
/*  Section / form schemas                                                     */
/* -------------------------------------------------------------------------- */

export function valueFields(section: FormSection): FormField[] {
  return section.fields.filter((field) => !isDisplayField(field.type));
}

/** Zod object for a single wizard step - this is what gates "Next". */
export function buildSectionSchema(section: FormSection) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of valueFields(section)) {
    shape[field.key] = buildFieldSchema(field);
  }
  return z.object(shape);
}

/** Zod object covering every section, used for the final submit check. */
export function buildFormZodSchema(form: FormSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const section of form.sections) {
    for (const field of valueFields(section)) {
      shape[field.key] = buildFieldSchema(field);
    }
  }
  return z.object(shape);
}

export type FormValidationResult =
  | { ok: true; data: SectionData }
  | { ok: false; errors: Record<string, string> };

export function validateForm(
  form: FormSchema,
  data: unknown,
): FormValidationResult {
  const parsed = buildFormZodSchema(form).safeParse(data ?? {});
  if (parsed.success) return { ok: true, data: parsed.data as SectionData };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export function validateSection(
  section: FormSection,
  data: unknown,
): FormValidationResult {
  const parsed = buildSectionSchema(section).safeParse(data ?? {});
  if (parsed.success) return { ok: true, data: parsed.data as SectionData };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export function emptyValueFor(field: FormField): FormValue {
  switch (field.type) {
    case "multiselect":
      return [];
    case "checkbox":
      return false;
    case "number":
      return "" as unknown as FormValue;
    case "file":
      return (field.validation?.maxFiles ?? 1) > 1 ? [] : null;
    default:
      return "";
  }
}

/**
 * Merges saved draft values over per-field defaults so react-hook-form always
 * receives a fully-populated (and therefore controlled) value map.
 */
export function buildDefaultValues(
  form: FormSchema,
  saved: SectionData | undefined | null,
): SectionData {
  const values: SectionData = {};
  for (const section of form.sections) {
    for (const field of valueFields(section)) {
      const savedValue = saved?.[field.key];
      values[field.key] =
        savedValue === undefined || savedValue === null
          ? emptyValueFor(field)
          : (savedValue as FormValue);
    }
  }
  return values;
}

/** Strips values whose fields have been deleted from the form definition. */
export function pruneToSchema(
  form: FormSchema,
  data: SectionData | undefined | null,
): SectionData {
  if (!data) return {};
  const keys = new Set(
    form.sections.flatMap((section) =>
      valueFields(section).map((field) => field.key),
    ),
  );
  const result: SectionData = {};
  for (const [key, value] of Object.entries(data)) {
    if (keys.has(key)) result[key] = value as FormValue;
  }
  return result;
}

export function allFields(form: FormSchema): FormField[] {
  return form.sections.flatMap((section) => section.fields);
}

export function findField(
  form: FormSchema,
  key: string,
): FormField | undefined {
  return allFields(form).find((field) => field.key === key);
}

/** Collects every uploaded file referenced by a data namespace. */
export function collectFiles(
  form: FormSchema,
  data: SectionData | undefined | null,
): FileValue[] {
  if (!data) return [];
  const files: FileValue[] = [];
  for (const field of allFields(form)) {
    if (field.type !== "file") continue;
    const value = data[field.key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isFileValue(entry)) files.push(entry);
      }
    } else if (isFileValue(value)) {
      files.push(value);
    }
  }
  return files;
}

export function isFileValue(value: unknown): value is FileValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    "name" in value &&
    typeof (value as FileValue).key === "string"
  );
}

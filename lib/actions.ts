import { z } from "zod";

/**
 * Uniform envelope returned by every server action so client components can
 * surface failures as toasts instead of unhandled promise rejections.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T) {
  return { ok: true, data } as ActionResult<T>;
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Turns a thrown error (including permission failures) into a result. */
export function failFrom(error: unknown): ActionResult<never> {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return { ok: false, error: message };
}

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Parses input with a schema, returning the uniform failure shape on error. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    error: "Please correct the highlighted fields.",
    fieldErrors: fieldErrorsOf(parsed.error),
  };
}

"use client";

import { useEffect } from "react";
import {
  Controller,
  useController,
  useWatch,
  type Control,
  type FieldValues,
} from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  conditionDependencies,
  isFieldRequired,
  isFieldVisible,
} from "@/lib/workflow/conditions";
import { formulaKeys } from "@/lib/workflow/calc";
import {
  computed,
  isLockedByProfile,
  type PrefillProfile,
} from "@/lib/workflow/autofill";
import type { AnyField, FileValue } from "@/lib/workflow/types";
import { cn } from "@/lib/utils";
import { FileField } from "./file-field";
import { RepeaterField } from "./repeater-field";

export type FieldRendererProps = {
  field: AnyField;
  control: Control<FieldValues>;
  disabled?: boolean;
  /**
   * Where the answer lives in the form, when that is not simply the field's
   * key: a column of a repeating group is addressed as
   * `qualifications.0.year`, so its errors land on the input that caused them.
   */
  name?: string;
  /** The account values a prefilled field draws on. */
  profile?: PrefillProfile | null;
};

/**
 * Renders one admin-defined field. Every input is a controlled react-hook-form
 * Controller so drafts, resets and validation all flow through a single source.
 */
export function FieldRenderer({
  field,
  control,
  disabled,
  name,
  profile,
}: FieldRendererProps) {
  const path = name ?? field.key;

  /**
   * A rule names a sibling: another field of the same form, or another column
   * of the same entry. The scope is therefore whatever `path` sits inside, so
   * `qualifications.0.year` looks for `qualifications.0.<key>`.
   */
  const scopePrefix = path.slice(0, path.lastIndexOf(".") + 1);
  const dependencies = conditionDependencies(field);

  const watched = useWatch({
    control,
    name: dependencies.map((key) => `${scopePrefix}${key}`),
  }) as unknown[];

  const scope: Record<string, unknown> = {};
  dependencies.forEach((key, index) => {
    scope[key] = watched[index];
  });

  const visible = isFieldVisible(field, scope);
  const required = isFieldRequired(field, scope);

  if (!visible) return null;

  // Worked out rather than asked for, and taken from the account rather than
  // asked for: both render as something to read, not something to fill in.
  if (field.formula) {
    return (
      <CalculatedField
        field={field}
        control={control}
        path={path}
        scopePrefix={scopePrefix}
        required={required}
      />
    );
  }

  const locked = isLockedByProfile(field, profile);

  if (field.type === "heading") {
    return (
      <h3 className="col-span-full text-base font-semibold first:mt-0">
        {field.label}
      </h3>
    );
  }

  if (field.type === "paragraph") {
    return (
      <p className="col-span-full text-sm text-muted-foreground">
        {field.description || field.label}
      </p>
    );
  }

  const inputId = `field-${path}`;

  if (field.type === "repeater") {
    return (
      <Field className="col-span-full" data-testid={`field-${path}`}>
        <FieldLabel htmlFor={inputId}>
          {field.label}
          {required ? (
            <span aria-hidden className="text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        {field.description ? (
          <FieldDescription>{field.description}</FieldDescription>
        ) : null}
        <RepeaterField
          field={field}
          control={control}
          name={path}
          disabled={disabled}
          profile={profile}
        />
      </Field>
    );
  }

  return (
    <Controller
      control={control}
      name={path}
      render={({ field: rhf, fieldState }) => {
        const invalid = Boolean(fieldState.error);

        return (
          <Field
            data-invalid={invalid}
            className={cn(
              field.width === "half" ? "sm:col-span-1" : "col-span-full",
            )}
            data-testid={`field-${path}`}
          >
            {field.type === "checkbox" ? null : (
              <FieldLabel htmlFor={inputId}>
                {field.label}
                {required ? (
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                ) : null}
              </FieldLabel>
            )}

            {renderControl()}

            {/* Three words rather than a sentence: it appears under every
                particular on the first page, and the section already explains
                where they come from. */}
            {locked ? (
              <FieldDescription data-testid={`prefilled-${path}`}>
                From your account
              </FieldDescription>
            ) : null}
            {field.description && field.type !== "checkbox" ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );

        function renderControl() {
          switch (field.type) {
            case "textarea":
              return (
                <Textarea
                  id={inputId}
                  rows={5}
                  placeholder={field.placeholder}
                  disabled={disabled || locked}
                  aria-invalid={invalid}
                  value={(rhf.value as string) ?? ""}
                  onChange={rhf.onChange}
                  onBlur={rhf.onBlur}
                  ref={rhf.ref}
                />
              );

            case "select":
              return (
                <Select
                  value={(rhf.value as string) ?? ""}
                  onValueChange={rhf.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger id={inputId} aria-invalid={invalid}>
                    <SelectValue
                      placeholder={field.placeholder || "Select an option"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.id} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );

            case "radio":
              return (
                <RadioGroup
                  value={(rhf.value as string) ?? ""}
                  onValueChange={rhf.onChange}
                  disabled={disabled}
                  aria-invalid={invalid}
                  className="gap-2"
                >
                  {field.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm"
                    >
                      <RadioGroupItem value={option.value} />
                      {option.label}
                    </label>
                  ))}
                </RadioGroup>
              );

            case "multiselect": {
              const selected = (rhf.value as string[]) ?? [];
              return (
                <div className="flex flex-col gap-2">
                  {field.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm"
                    >
                      <Checkbox
                        checked={selected.includes(option.value)}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          rhf.onChange(
                            checked === true
                              ? [...selected, option.value]
                              : selected.filter((v) => v !== option.value),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              );
            }

            case "checkbox":
              return (
                <label className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm">
                  <Checkbox
                    id={inputId}
                    checked={rhf.value === true}
                    disabled={disabled}
                    aria-invalid={invalid}
                    onCheckedChange={(checked) =>
                      rhf.onChange(checked === true)
                    }
                  />
                  <span>
                    {field.label}
                    {required ? (
                      <span aria-hidden className="text-destructive">
                        {" "}
                        *
                      </span>
                    ) : null}
                    {field.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {field.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              );

            case "file":
              return (
                <FileField
                  id={inputId}
                  value={rhf.value as FileValue | FileValue[] | null}
                  onChange={rhf.onChange}
                  validation={field.validation}
                  disabled={disabled}
                  invalid={invalid}
                />
              );

            default:
              return (
                <Input
                  id={inputId}
                  type={
                    field.type === "number"
                      ? "number"
                      : field.type === "email"
                        ? "email"
                        : field.type === "phone"
                          ? "tel"
                          : field.type === "date"
                            ? "date"
                            : "text"
                  }
                  placeholder={field.placeholder}
                  disabled={disabled}
                  readOnly={locked}
                  aria-readonly={locked || undefined}
                  className={cn(locked && "bg-muted")}
                  aria-invalid={invalid}
                  value={(rhf.value as string | number) ?? ""}
                  onChange={rhf.onChange}
                  onBlur={rhf.onBlur}
                  ref={rhf.ref}
                />
              );
          }
        }
      }}
    />
  );
}

/**
 * An answer the form works out for itself.
 *
 * The value is written back into the form rather than only displayed, so it is
 * what gets validated, drafted and submitted - and recomputed again on the
 * server, which is what makes the read-only input honest rather than merely
 * discouraging.
 */
function CalculatedField({
  field,
  control,
  path,
  scopePrefix,
  required,
}: {
  field: AnyField;
  control: Control<FieldValues>;
  path: string;
  scopePrefix: string;
  required: boolean;
}) {
  const keys = formulaKeys(field.formula ?? "");
  const watched = useWatch({
    control,
    name: keys.map((key) => `${scopePrefix}${key}`),
  }) as unknown[];

  const scope: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    scope[key] = watched[index];
  });

  const value = computed(field, scope);
  const { field: rhf, fieldState } = useController({ control, name: path });

  useEffect(() => {
    if (rhf.value !== value) rhf.onChange(value);
    // Only the computed value should drive this; `rhf` is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const inputId = `field-${path}`;

  return (
    <Field
      data-invalid={Boolean(fieldState.error)}
      className={cn(field.width === "half" ? "sm:col-span-1" : "col-span-full")}
      data-testid={`field-${path}`}
    >
      <FieldLabel htmlFor={inputId}>
        {field.label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      <Input
        id={inputId}
        readOnly
        aria-readonly
        className="bg-muted"
        data-testid={`calculated-${path}`}
        value={value ?? ""}
      />
      <FieldDescription>
        {field.description || "Worked out from your other answers."}
      </FieldDescription>
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}

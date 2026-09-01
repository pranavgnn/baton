"use client";

import { Controller, type Control, type FieldValues } from "react-hook-form";

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
}: FieldRendererProps) {
  const path = name ?? field.key;

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
          {field.required ? (
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
                {field.required ? (
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                ) : null}
              </FieldLabel>
            )}

            {renderControl()}

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
                  disabled={disabled}
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
                    {field.required ? (
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

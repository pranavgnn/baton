"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  useFieldArray,
  useFormState,
  type Control,
  type FieldValues,
  type FieldArrayPath,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { emptyRow, valueColumns } from "@/lib/workflow/form";
import type { AnyField } from "@/lib/workflow/types";
import { FieldRenderer } from "./field-renderer";

export type RepeaterFieldProps = {
  field: AnyField;
  control: Control<FieldValues>;
  /** Where this group sits in the form, e.g. `qualifications`. */
  name: string;
  disabled?: boolean;
};

/**
 * A group of columns the applicant fills in once per entry.
 *
 * The rows themselves are react-hook-form's `useFieldArray`, so adding,
 * removing and validating an entry all go through the same machinery as every
 * other field - including per-row error paths like
 * `qualifications.1.year`, which is what lets a message land on the input that
 * caused it rather than on the group as a whole.
 */
export function RepeaterField({
  field,
  control,
  name,
  disabled,
}: RepeaterFieldProps) {
  const columns = valueColumns(field);
  const {
    fields: rows,
    append,
    remove,
  } = useFieldArray({
    control,
    name: name as FieldArrayPath<FieldValues>,
  });

  /**
   * The group's own complaint - too few entries, too many - as opposed to a
   * complaint about one column of one entry, which lands on that input.
   */
  const { errors } = useFormState({ control, name });
  const groupError = errors[name] as
    { message?: string; root?: { message?: string } } | undefined;
  const groupMessage = groupError?.root?.message ?? groupError?.message;

  const maxRows = field.validation?.maxRows ?? null;
  const minRows = field.validation?.minRows ?? (field.required ? 1 : 0);
  const atLimit = maxRows != null && rows.length >= maxRows;

  return (
    <div className="repeater" data-testid={`repeater-${field.key}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <ol className="repeater-rows">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="repeater-row"
              data-testid={`${field.key}-row-${index}`}
            >
              <div className="repeater-row-header">
                <span className="repeater-row-number">Entry {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || rows.length <= minRows}
                  onClick={() => remove(index)}
                  aria-label={`Remove entry ${index + 1} of ${field.label}`}
                  data-testid={`${field.key}-remove-${index}`}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              </div>

              <div className="field-grid">
                {columns.map((column) => (
                  <FieldRenderer
                    key={column.id}
                    field={column}
                    control={control}
                    disabled={disabled}
                    name={`${name}.${index}.${column.key}`}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled || atLimit}
        onClick={() => append(emptyRow(field))}
        data-testid={`${field.key}-add`}
      >
        <Plus className="size-4" />
        {atLimit
          ? `Limit of ${maxRows} entries reached`
          : rows.length === 0
            ? "Add the first entry"
            : "Add another entry"}
      </Button>

      {groupMessage ? (
        <FieldError errors={[{ message: groupMessage }]} />
      ) : null}
    </div>
  );
}

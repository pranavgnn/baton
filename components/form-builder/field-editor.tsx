"use client";

import {
  FileCheck,
  GripVertical,
  List,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/workflow/defaults";
import {
  hasChoices,
  isDisplayField,
  type FieldOption,
  type FormField,
} from "@/lib/workflow/types";
import { cn } from "@/lib/utils";

/** Machine-key suggestion derived from the label, e.g. "Full name" -> full_name. */
export function slugifyKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return /^[a-z]/.test(slug) ? slug : `field_${slug || "1"}`;
}

export function FieldEditor({
  field,
  onChange,
  siblingKeys,
}: {
  field: FormField;
  onChange: (next: FormField) => void;
  siblingKeys: string[];
}) {
  const [activeTab, setActiveTab] = useState<"general" | "options" | "validation">("general");

  const update = (patch: Partial<FormField>) =>
    onChange({ ...field, ...patch });

  const updateValidation = (patch: Partial<FormField["validation"]>) =>
    onChange({ ...field, validation: { ...field.validation, ...patch } });

  const duplicateKey = siblingKeys.includes(field.key);
  const invalidKey = !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.key);

  const isDisplay = isDisplayField(field.type);
  const isFile = field.type === "file";
  const isText = field.type === "text" || field.type === "textarea";
  const isNumber = field.type === "number";
  const supportsChoices = hasChoices(field.type);
  const supportsValidation = isText || isNumber || isFile;

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border bg-card/60 p-4 shadow-xs">
      {/* Settings Sub-Tabs Header (if field has options or validation) */}
      {(supportsChoices || supportsValidation) && !isDisplay ? (
        <div className="flex items-center gap-1.5 border-b pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "general"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            General Settings
          </button>

          {supportsChoices ? (
            <button
              type="button"
              onClick={() => setActiveTab("options")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "options"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <List className="size-3.5" />
              Options ({field.options.length})
            </button>
          ) : null}

          {supportsValidation ? (
            <button
              type="button"
              onClick={() => setActiveTab("validation")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "validation"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <FileCheck className="size-3.5" />
              Validation & Rules
            </button>
          ) : null}
        </div>
      ) : null}

      {/* General Settings Tab */}
      {activeTab === "general" || isDisplay || (!supportsChoices && !supportsValidation) ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${field.id}-label`}>
                {isDisplay ? "Text" : "Label"}
              </FieldLabel>
              <Input
                id={`${field.id}-label`}
                value={field.label}
                placeholder={isDisplay ? "Section Heading..." : "e.g. Full Name"}
                onChange={(event) => {
                  const label = event.target.value;
                  const keyWasDerived = field.key === slugifyKey(field.label);
                  update(
                    keyWasDerived ? { label, key: slugifyKey(label) } : { label },
                  );
                }}
              />
            </Field>

            {isDisplay ? null : (
              <Field data-invalid={duplicateKey || invalidKey}>
                <FieldLabel htmlFor={`${field.id}-key`}>Data key</FieldLabel>
                <Input
                  id={`${field.id}-key`}
                  value={field.key}
                  className="font-mono"
                  onChange={(event) => update({ key: event.target.value })}
                  aria-invalid={duplicateKey || invalidKey}
                />
                <FieldDescription>
                  {duplicateKey
                    ? "Another field in this form already uses this key."
                    : invalidKey
                      ? "Letters, digits and underscores only, starting with a letter."
                      : "How the answer is stored. Changing it orphans existing data."}
                </FieldDescription>
              </Field>
            )}
          </div>

          {isDisplay ? null : (
            <>
              <Field>
                <FieldLabel htmlFor={`${field.id}-description`}>
                  Helper text
                </FieldLabel>
                <Input
                  id={`${field.id}-description`}
                  value={field.description}
                  placeholder="Shown under the input"
                  onChange={(event) => update({ description: event.target.value })}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                {isFile ? null : (
                  <Field>
                    <FieldLabel htmlFor={`${field.id}-placeholder`}>
                      Placeholder
                    </FieldLabel>
                    <Input
                      id={`${field.id}-placeholder`}
                      value={field.placeholder}
                      onChange={(event) =>
                        update({ placeholder: event.target.value })
                      }
                    />
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor={`${field.id}-width`}>Width</FieldLabel>
                  <Select
                    value={field.width}
                    onValueChange={(value) =>
                      update({ width: value as FormField["width"] })
                    }
                  >
                    <SelectTrigger id={`${field.id}-width`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full row</SelectItem>
                      <SelectItem value="half">Half row</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <label className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm transition-colors hover:bg-muted/50">
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(checked) =>
                    update({ required: checked === true })
                  }
                />
                <span className="font-medium text-foreground">
                  Required - the applicant cannot move past this section without it
                </span>
              </label>
            </>
          )}

          {field.type === "paragraph" ? (
            <Field>
              <FieldLabel htmlFor={`${field.id}-body`}>Paragraph text</FieldLabel>
              <Textarea
                id={`${field.id}-body`}
                value={field.description}
                rows={3}
                onChange={(event) => update({ description: event.target.value })}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {/* Choices Tab */}
      {activeTab === "options" && supportsChoices && !isDisplay ? (
        <OptionsEditor
          options={field.options}
          onChange={(options) => update({ options })}
        />
      ) : null}

      {/* Validation Tab */}
      {activeTab === "validation" && supportsValidation && !isDisplay ? (
        <div className="flex flex-col gap-4">
          {isText ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id={`${field.id}-min-length`}
                label="Minimum characters"
                value={field.validation.minLength}
                onChange={(minLength) => updateValidation({ minLength })}
              />
              <NumberField
                id={`${field.id}-max-length`}
                label="Maximum characters"
                value={field.validation.maxLength}
                onChange={(maxLength) => updateValidation({ maxLength })}
              />
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${field.id}-pattern`}>
                  Pattern (regular expression)
                </FieldLabel>
                <Input
                  id={`${field.id}-pattern`}
                  value={field.validation.pattern ?? ""}
                  className="font-mono"
                  placeholder="^[A-Z]{2}[0-9]{4}$"
                  onChange={(event) =>
                    updateValidation({ pattern: event.target.value || null })
                  }
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${field.id}-pattern-message`}>
                  Message shown when the pattern fails
                </FieldLabel>
                <Input
                  id={`${field.id}-pattern-message`}
                  value={field.validation.patternMessage ?? ""}
                  onChange={(event) =>
                    updateValidation({ patternMessage: event.target.value || null })
                  }
                />
              </Field>
            </div>
          ) : null}

          {isNumber ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id={`${field.id}-min`}
                label="Minimum value"
                value={field.validation.min}
                onChange={(min) => updateValidation({ min })}
              />
              <NumberField
                id={`${field.id}-max`}
                label="Maximum value"
                value={field.validation.max}
                onChange={(max) => updateValidation({ max })}
              />
            </div>
          ) : null}

          {isFile ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id={`${field.id}-max-size`}
                label="Maximum size per file (MB)"
                value={field.validation.maxFileSizeMb}
                onChange={(maxFileSizeMb) => updateValidation({ maxFileSizeMb })}
              />
              <NumberField
                id={`${field.id}-max-files`}
                label="Maximum number of files"
                value={field.validation.maxFiles}
                onChange={(maxFiles) => updateValidation({ maxFiles })}
              />
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={`${field.id}-accept`}>
                  Accepted file types
                </FieldLabel>
                <Input
                  id={`${field.id}-accept`}
                  value={(field.validation.acceptedFileTypes ?? []).join(", ")}
                  placeholder="application/pdf, .pdf, image/*"
                  onChange={(event) =>
                    updateValidation({
                      acceptedFileTypes: event.target.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <FieldDescription>
                  Comma-separated MIME types, wildcards or extensions.
                </FieldDescription>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
      />
    </Field>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
}) {
  function update(id: string, patch: Partial<FieldOption>) {
    onChange(
      options.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    );
  }

  return (
    <Field>
      <FieldLabel>Options</FieldLabel>
      <div className="flex flex-col gap-2">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No options yet - add at least one.
          </p>
        ) : null}

        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2 rounded-md border bg-card p-2 shadow-2xs">
            <GripVertical className="size-4 shrink-0 text-muted-foreground cursor-grab" />
            <Input
              value={option.label}
              placeholder="Label shown to the user"
              onChange={(event) => {
                const label = event.target.value;
                const valueWasDerived =
                  option.value === slugifyKey(option.label);
                update(
                  option.id,
                  valueWasDerived
                    ? { label, value: slugifyKey(label) }
                    : { label },
                );
              }}
            />
            <Input
              value={option.value}
              placeholder="stored_value"
              className="font-mono"
              onChange={(event) =>
                update(option.id, { value: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove option ${option.label || "untitled"}`}
              onClick={() =>
                onChange(options.filter((entry) => entry.id !== option.id))
              }
            >
              <Trash2 className="size-4 text-destructive/80 hover:text-destructive" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start mt-1"
          onClick={() =>
            onChange([...options, { id: newId("opt"), label: "", value: "" }])
          }
        >
          <Plus className="size-4" />
          Add option
        </Button>
      </div>
    </Field>
  );
}

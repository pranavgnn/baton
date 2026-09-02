"use client";

import {
  ChevronDown,
  ChevronUp,
  FileCheck,
  GitBranch,
  GripVertical,
  List,
  Plus,
  Rows3,
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
import { formulaError } from "@/lib/workflow/calc";
import { createField, newId } from "@/lib/workflow/defaults";
import { PREFILL_SOURCES } from "@/lib/users/profile";
import {
  CONDITION_OPERATORS,
  FIELD_TYPES,
  hasChoices,
  isDisplayField,
  isValuelessOperator,
  type ColumnField,
  type ConditionGroup,
  type ConditionOperator,
  type FieldOption,
  type FieldType,
  type FormField,
} from "@/lib/workflow/types";
import { cn } from "@/lib/utils";

/** Radix forbids an empty item value, so "ask for it" carries a sentinel. */
const NO_PREFILL = "__ask__";

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
  const [activeTab, setActiveTab] = useState<
    "general" | "options" | "validation" | "columns" | "rules"
  >("general");

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
  const isRepeating = field.type === "repeater";
  const formulaComplaint = field.formula ? formulaError(field.formula) : null;
  const supportsChoices = hasChoices(field.type);
  const supportsValidation = isText || isNumber || isFile || isRepeating;

  const ruleCount =
    (field.visibleWhen?.rules.length ?? 0) +
    (field.requiredWhen?.rules.length ?? 0);

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border bg-card/60 p-4 shadow-xs">
      {/* Settings Sub-Tabs Header (if field has options or validation) */}
      {!isDisplay ? (
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

          {isRepeating ? (
            <button
              type="button"
              onClick={() => setActiveTab("columns")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "columns"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              data-testid={`${field.id}-columns-tab`}
            >
              <Rows3 className="size-3.5" />
              Columns ({(field.fields ?? []).length})
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "rules"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            data-testid={`${field.id}-rules-tab`}
          >
            <GitBranch className="size-3.5" />
            When it applies
            {ruleCount > 0 ? ` (${ruleCount})` : ""}
          </button>

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
      {activeTab === "general" ||
      isDisplay ||
      (!supportsChoices && !supportsValidation) ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${field.id}-label`}>
                {isDisplay ? "Text" : "Label"}
              </FieldLabel>
              <Input
                id={`${field.id}-label`}
                value={field.label}
                placeholder={
                  isDisplay ? "Section Heading..." : "e.g. Full Name"
                }
                onChange={(event) => {
                  const label = event.target.value;
                  const keyWasDerived = field.key === slugifyKey(field.label);
                  update(
                    keyWasDerived
                      ? { label, key: slugifyKey(label) }
                      : { label },
                  );
                }}
              />
            </Field>

            {isDisplay ? null : (
              <Field data-invalid={duplicateKey || invalidKey}>
                <FieldLabel htmlFor={`${field.id}-key`}>Answer key</FieldLabel>
                <Input
                  id={`${field.id}-key`}
                  value={field.key}
                  className="font-mono"
                  onChange={(event) => update({ key: event.target.value })}
                  aria-invalid={duplicateKey || invalidKey}
                />
                <FieldDescription>
                  {duplicateKey
                    ? "Another question on this form already uses this key."
                    : invalidKey
                      ? "Letters, digits and underscores only, starting with a letter."
                      : "How this answer is filed. Change it and answers already given will no longer be matched to this question."}
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
                  onChange={(event) =>
                    update({ description: event.target.value })
                  }
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
                  Required - the applicant cannot move past this section without
                  it
                </span>
              </label>

              {/* Answers the form can provide for itself, rather than ask
                  for: from the person's own account, or from the answers
                  beside it. */}
              <Field>
                <FieldLabel htmlFor={`${field.id}-prefill`}>
                  Fill in from the account
                </FieldLabel>
                <Select
                  value={field.prefill ?? NO_PREFILL}
                  onValueChange={(value) =>
                    update({ prefill: value === NO_PREFILL ? null : value })
                  }
                >
                  <SelectTrigger
                    id={`${field.id}-prefill`}
                    data-testid="field-prefill"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PREFILL}>
                      Ask for it - fill in nothing
                    </SelectItem>
                    {PREFILL_SOURCES.map((source) => (
                      <SelectItem key={source.key} value={source.key}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {field.prefill
                    ? "Shown read-only when the account has a value, and asked for as usual when it does not."
                    : "The account already holds the particulars on the first page of the form."}
                </FieldDescription>
              </Field>

              {isNumber ? (
                <Field data-invalid={Boolean(formulaComplaint)}>
                  <FieldLabel htmlFor={`${field.id}-formula`}>
                    Work it out instead of asking
                  </FieldLabel>
                  <Input
                    id={`${field.id}-formula`}
                    value={field.formula ?? ""}
                    placeholder="indexed + non_indexed"
                    className="font-mono text-sm"
                    aria-invalid={Boolean(formulaComplaint)}
                    data-testid="field-formula"
                    onChange={(event) =>
                      update({ formula: event.target.value || null })
                    }
                  />
                  <FieldDescription>
                    {formulaComplaint ??
                      "Use the data keys of other questions on this form with + - * / and brackets. The applicant sees the answer, and cannot type over it."}
                  </FieldDescription>
                </Field>
              ) : null}
            </>
          )}

          {field.type === "paragraph" ? (
            <Field>
              <FieldLabel htmlFor={`${field.id}-body`}>
                Paragraph text
              </FieldLabel>
              <Textarea
                id={`${field.id}-body`}
                value={field.description}
                rows={3}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {/* Rules Tab */}
      {activeTab === "rules" && !isDisplay ? (
        <div className="flex flex-col gap-5" data-testid="rules-editor">
          <ConditionEditor
            id={`${field.id}-visible`}
            title="Show this question only when"
            hint="Leave empty to always show it. A hidden question is never asked and never required."
            siblings={siblingKeys}
            group={field.visibleWhen}
            onChange={(visibleWhen) => update({ visibleWhen })}
          />
          <ConditionEditor
            id={`${field.id}-required`}
            title="Require an answer only when"
            hint="Leave empty to use the Required tick box above."
            siblings={siblingKeys}
            group={field.requiredWhen}
            onChange={(requiredWhen) => update({ requiredWhen })}
          />
        </div>
      ) : null}

      {/* Columns Tab */}
      {activeTab === "columns" && isRepeating ? (
        <ColumnsEditor
          columns={field.fields ?? []}
          onChange={(fields) => update({ fields })}
        />
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
          {isRepeating ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id={`${field.id}-min-rows`}
                label="Fewest entries"
                value={field.validation.minRows}
                onChange={(minRows) => updateValidation({ minRows })}
              />
              <NumberField
                id={`${field.id}-max-rows`}
                label="Most entries"
                value={field.validation.maxRows}
                onChange={(maxRows) => updateValidation({ maxRows })}
              />
            </div>
          ) : null}

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
                    updateValidation({
                      patternMessage: event.target.value || null,
                    })
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
                onChange={(maxFileSizeMb) =>
                  updateValidation({ maxFileSizeMb })
                }
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

/**
 * The columns of a repeating group.
 *
 * Each column is edited with the same editor as any other field, so a column
 * keeps its own type, options and validation - a year is a number with a
 * range, a grade is a dropdown. Only its `fields` are dropped on the way back,
 * because a group cannot contain another group.
 */
function ColumnsEditor({
  columns,
  onChange,
}: {
  columns: ColumnField[];
  onChange: (columns: ColumnField[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const COLUMN_TYPES = FIELD_TYPES.filter(
    (type) => type !== "repeater" && !isDisplayField(type),
  );

  function update(id: string, next: FormField) {
    // A column is a field without columns of its own.
    const column: ColumnField = { ...next };
    delete (column as Partial<FormField>).fields;
    onChange(columns.map((entry) => (entry.id === id ? column : entry)));
  }

  function move(index: number, by: number) {
    const next = [...columns];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function add() {
    const taken = new Set(columns.map((column) => column.key));
    let key = `column_${columns.length + 1}`;
    let n = columns.length + 1;
    while (taken.has(key)) key = `column_${++n}`;

    onChange([
      ...columns,
      createField({ type: "text", label: `Column ${columns.length + 1}`, key }),
    ]);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="columns-editor">
      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A repeating group needs at least one column before it can be
          published.
        </p>
      ) : null}

      {columns.map((column, index) => {
        const open = openId === column.id;
        const siblingKeys = columns
          .filter((entry) => entry.id !== column.id)
          .map((entry) => entry.key);

        return (
          <div
            key={column.id}
            className="rounded-lg border bg-background"
            data-testid={`column-${column.key}`}
          >
            <div className="flex items-center gap-2 p-2.5">
              <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm font-medium"
                onClick={() => setOpenId(open ? null : column.id)}
                data-testid={`column-toggle-${column.key}`}
              >
                <span className="truncate">{column.label}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {column.key}
                </span>
              </button>

              <Select
                value={column.type}
                onValueChange={(type) =>
                  update(column.id, {
                    ...column,
                    fields: [],
                    type: type as FieldType,
                  })
                }
              >
                <SelectTrigger
                  className="w-40"
                  aria-label={`Type of ${column.label}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${column.label} up`}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === columns.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${column.label} down`}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  onChange(columns.filter((entry) => entry.id !== column.id))
                }
                aria-label={`Delete ${column.label}`}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>

            {open ? (
              <div className="border-t p-2.5">
                <FieldEditor
                  field={{ ...column, fields: [] }}
                  onChange={(next) => update(column.id, next)}
                  siblingKeys={siblingKeys}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={add}
        data-testid="add-column"
      >
        <Plus className="size-4" />
        Add column
      </Button>
    </div>
  );
}

/**
 * One set of rules: when to show a question, or when to insist on an answer.
 *
 * Rules may only reference the questions beside this one - the same form, or
 * the same repeating entry - because that is the scope the answers are
 * evaluated in when the form runs.
 */
function ConditionEditor({
  id,
  title,
  hint,
  siblings,
  group,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  siblings: string[];
  group: ConditionGroup | null;
  onChange: (group: ConditionGroup | null) => void;
}) {
  const rules = group?.rules ?? [];
  const mode = group?.mode ?? "all";

  function setRules(next: ConditionGroup["rules"]) {
    onChange(next.length === 0 ? null : { mode, rules: next });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        {rules.length > 1 ? (
          <Select
            value={mode}
            onValueChange={(next) =>
              onChange({ mode: next as ConditionGroup["mode"], rules })
            }
          >
            <SelectTrigger className="w-36" aria-label={`${title} - match`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all of these</SelectItem>
              <SelectItem value="any">any of these</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {rules.length === 0 ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2">
              <Select
                value={rule.field}
                onValueChange={(value) =>
                  setRules(
                    rules.map((entry) =>
                      entry.id === rule.id ? { ...entry, field: value } : entry,
                    ),
                  )
                }
              >
                <SelectTrigger
                  className="w-48"
                  aria-label={`Rule ${index + 1} question`}
                >
                  <SelectValue placeholder="Choose a question" />
                </SelectTrigger>
                <SelectContent>
                  {siblings.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.operator}
                onValueChange={(value) =>
                  setRules(
                    rules.map((entry) =>
                      entry.id === rule.id
                        ? {
                            ...entry,
                            operator: value as ConditionOperator,
                            value: isValuelessOperator(value)
                              ? ""
                              : entry.value,
                          }
                        : entry,
                    ),
                  )
                }
              >
                <SelectTrigger
                  className="w-44"
                  aria-label={`Rule ${index + 1} test`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map((operator) => (
                    <SelectItem key={operator.key} value={operator.key}>
                      {operator.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isValuelessOperator(rule.operator) ? null : (
                <Input
                  className="w-40"
                  value={rule.value}
                  aria-label={`Rule ${index + 1} value`}
                  onChange={(event) =>
                    setRules(
                      rules.map((entry) =>
                        entry.id === rule.id
                          ? { ...entry, value: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove rule ${index + 1}`}
                onClick={() =>
                  setRules(rules.filter((entry) => entry.id !== rule.id))
                }
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={siblings.length === 0}
        onClick={() =>
          setRules([
            ...rules,
            {
              id: newId("rule"),
              field: siblings[0] ?? "",
              operator: "equals",
              value: "",
            },
          ])
        }
        data-testid={`${id}-add`}
      >
        <Plus className="size-4" />
        Add a rule
      </Button>
    </div>
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
          <div
            key={option.id}
            className="flex items-center gap-2 rounded-md border bg-card p-2 shadow-2xs"
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
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
          className="mt-1 self-start"
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

"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  Eye,
  GripVertical,
  Hash,
  Heading,
  Layers,
  LayoutGrid,
  ListChecks,
  Mail,
  Paperclip,
  PenTool,
  Phone,
  Plus,
  Rows3,
  Text,
  Trash2,
  Type,
} from "lucide-react";
import { useState, type ComponentType } from "react";

import { FormWizard } from "@/components/form-runtime/form-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createField, createSection, newId } from "@/lib/workflow/defaults";
import {
  isDisplayField,
  type FieldType,
  type FormField,
  type FormSchema,
  type FormSection,
} from "@/lib/workflow/types";
import { cn } from "@/lib/utils";
import { FieldEditor, slugifyKey } from "./field-editor";

const FIELD_PALETTE: {
  type: FieldType;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: "Input" | "Choice" | "Upload" | "Layout";
  description: string;
}[] = [
  {
    type: "text",
    label: "Short text",
    icon: Type,
    group: "Input",
    description: "Single line text response",
  },
  {
    type: "textarea",
    label: "Long text",
    icon: AlignLeft,
    group: "Input",
    description: "Multi-line text area",
  },
  {
    type: "number",
    label: "Number",
    icon: Hash,
    group: "Input",
    description: "Numeric value input",
  },
  {
    type: "email",
    label: "Email",
    icon: Mail,
    group: "Input",
    description: "Validated email address",
  },
  {
    type: "phone",
    label: "Phone",
    icon: Phone,
    group: "Input",
    description: "Contact phone number",
  },
  {
    type: "date",
    label: "Date",
    icon: Calendar,
    group: "Input",
    description: "Date selector picker",
  },
  {
    type: "select",
    label: "Dropdown",
    icon: ListChecks,
    group: "Choice",
    description: "Single choice from dropdown menu",
  },
  {
    type: "radio",
    label: "Single choice",
    icon: CircleDot,
    group: "Choice",
    description: "Radio buttons selection",
  },
  {
    type: "multiselect",
    label: "Multiple choice",
    icon: ListChecks,
    group: "Choice",
    description: "Select multiple options",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: CheckSquare,
    group: "Choice",
    description: "A single tick box",
  },
  {
    type: "file",
    label: "File upload",
    icon: Paperclip,
    group: "Upload",
    description: "Upload document or media file",
  },
  {
    type: "repeater",
    label: "Repeating group",
    icon: Rows3,
    group: "Layout",
    description: "A set of columns filled in once per entry",
  },
  {
    type: "heading",
    label: "Heading",
    icon: Heading,
    group: "Layout",
    description: "Section heading separator text",
  },
  {
    type: "paragraph",
    label: "Paragraph",
    icon: Text,
    group: "Layout",
    description: "Static instructional text block",
  },
];

const PALETTE_GROUPS = ["Input", "Choice", "Upload", "Layout"] as const;

export function fieldTypeLabel(type: FieldType): string {
  return FIELD_PALETTE.find((entry) => entry.type === type)?.label ?? type;
}

export type FormBuilderProps = {
  value: FormSchema;
  onChange: (next: FormSchema) => void;
};

export function FormBuilder({ value, onChange }: FormBuilderProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    value.sections[0]?.id ?? null,
  );
  const [viewMode, setViewMode] = useState<"builder" | "preview">("builder");

  const activeSection =
    value.sections.find((section) => section.id === activeSectionId) ??
    value.sections[0] ??
    null;

  const totalFields = value.sections.reduce(
    (acc, section) => acc + section.fields.length,
    0,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function updateSections(sections: FormSection[]) {
    onChange({ ...value, sections });
  }

  function updateSection(id: string, patch: Partial<FormSection>) {
    updateSections(
      value.sections.map((section) =>
        section.id === id ? { ...section, ...patch } : section,
      ),
    );
  }

  function addSection() {
    const section = createSection(`Section ${value.sections.length + 1}`);
    updateSections([...value.sections, section]);
    setActiveSectionId(section.id);
  }

  function removeSection(id: string) {
    const remaining = value.sections.filter((section) => section.id !== id);
    updateSections(remaining);
    if (activeSectionId === id) {
      setActiveSectionId(remaining[0]?.id ?? null);
    }
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = value.sections.findIndex((s) => s.id === active.id);
    const to = value.sections.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    updateSections(arrayMove(value.sections, from, to));
  }

  function handleFieldDragEnd(event: DragEndEvent) {
    if (!activeSection) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = activeSection.fields.findIndex((f) => f.id === active.id);
    const to = activeSection.fields.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    updateSection(activeSection.id, {
      fields: arrayMove(activeSection.fields, from, to),
    });
  }

  function addField(type: FieldType) {
    if (!activeSection) return;
    const label = isDisplayField(type)
      ? fieldTypeLabel(type)
      : `Untitled ${fieldTypeLabel(type).toLowerCase()}`;

    const field = createField({
      type,
      label,
      key: uniqueKey(slugifyKey(label), allKeys(value)),
      options: ["select", "radio", "multiselect"].includes(type)
        ? [
            { id: newId("opt"), label: "Option 1", value: "option_1" },
            { id: newId("opt"), label: "Option 2", value: "option_2" },
          ]
        : [],
      validation: type === "file" ? { maxFileSizeMb: 10, maxFiles: 1 } : {},
      // A group with no columns cannot be published, so it starts with one.
      fields:
        type === "repeater"
          ? [
              createField({
                type: "text",
                label: "Column 1",
                key: "column_1",
              }),
            ]
          : [],
    });

    updateSection(activeSection.id, {
      fields: [...activeSection.fields, field],
    });
  }

  function updateField(fieldId: string, next: FormField) {
    if (!activeSection) return;
    updateSection(activeSection.id, {
      fields: activeSection.fields.map((field) =>
        field.id === fieldId ? next : field,
      ),
    });
  }

  function duplicateField(field: FormField) {
    if (!activeSection) return;
    const copy: FormField = {
      ...field,
      id: newId("fld"),
      key: uniqueKey(`${field.key}_copy`, allKeys(value)),
      label: `${field.label} (copy)`,
      options: field.options.map((option) => ({
        ...option,
        id: newId("opt"),
      })),
    };
    const index = activeSection.fields.findIndex((f) => f.id === field.id);
    const fields = [...activeSection.fields];
    fields.splice(index + 1, 0, copy);
    updateSection(activeSection.id, { fields });
  }

  function removeField(fieldId: string) {
    if (!activeSection) return;
    updateSection(activeSection.id, {
      fields: activeSection.fields.filter((field) => field.id !== fieldId),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/70 p-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm leading-none font-semibold">
                Form Canvas
              </h3>
              <Badge variant="secondary" className="text-[11px] font-medium">
                {value.sections.length} Section
                {value.sections.length === 1 ? "" : "s"} · {totalFields} Field
                {totalFields === 1 ? "" : "s"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Design multi-step form wizard pages for applicants & reviewers.
            </p>
          </div>
        </div>

        {/* View Mode Toggle: Builder vs Live Preview */}
        <div className="flex items-center rounded-lg border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setViewMode("builder")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              viewMode === "builder"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PenTool className="size-3.5" />
            Editor Mode
          </button>
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              viewMode === "preview"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="size-3.5" />
            Live Preview
          </button>
        </div>
      </div>

      {viewMode === "preview" ? (
        <div className="min-h-[400px] rounded-xl border bg-card p-6 shadow-xs">
          <FormWizard
            key={JSON.stringify(value)}
            form={value}
            defaultValues={null}
            preview
            renderSubmitActions={() => (
              <Button disabled className="gap-2">
                Submit Application (Preview Mode)
              </Button>
            )}
          />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Left Panel: Sections / Wizard Steps Navigator */}
          <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Wizard Steps ({value.sections.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs font-medium"
                onClick={addSection}
                data-testid="add-section"
              >
                <Plus className="size-3.5" />
                Add Step
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext
                items={value.sections.map((section) => section.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {value.sections.map((section, index) => (
                    <SortableSectionTab
                      key={section.id}
                      section={section}
                      index={index}
                      active={section.id === activeSection?.id}
                      onSelect={() => setActiveSectionId(section.id)}
                      onRemove={() => removeSection(section.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            {value.sections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Click &quot;+ Add Step&quot; above to start building this
                wizard.
              </div>
            ) : null}
          </div>

          {/* Right Main Canvas: Active Section & Fields */}
          {activeSection ? (
            <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs">
              {/* Section Header Card */}
              <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      Step{" "}
                      {value.sections.findIndex(
                        (s) => s.id === activeSection.id,
                      ) + 1}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      Section Settings
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="section-title">
                      Section title
                    </FieldLabel>
                    <Input
                      id="section-title"
                      value={activeSection.title}
                      placeholder="e.g. Personal Information"
                      onChange={(event) =>
                        updateSection(activeSection.id, {
                          title: event.target.value,
                        })
                      }
                      data-testid="section-title"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="section-description">
                      Section description
                    </FieldLabel>
                    <Textarea
                      id="section-description"
                      rows={2}
                      placeholder="Brief instructions for this wizard step..."
                      value={activeSection.description}
                      onChange={(event) =>
                        updateSection(activeSection.id, {
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
              </div>

              {/* Fields Area Bar */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Fields ({activeSection.fields.length})
                  </h4>
                </div>

                {/* Prominent Add Field Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      data-testid="add-field"
                    >
                      <Plus className="size-4" />
                      Add Field
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {PALETTE_GROUPS.map((group, groupIndex) => (
                      <div key={group}>
                        {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuLabel className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                          {group} Elements
                        </DropdownMenuLabel>
                        {FIELD_PALETTE.filter(
                          (entry) => entry.group === group,
                        ).map((entry) => (
                          <DropdownMenuItem
                            key={entry.type}
                            onClick={() => addField(entry.type)}
                            data-testid={`add-field-${entry.type}`}
                            className="flex items-start gap-2.5 py-2"
                          >
                            <entry.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                            <div className="flex flex-col">
                              <span className="text-xs leading-none font-medium">
                                {entry.label}
                              </span>
                              <span className="mt-0.5 text-[10px] text-muted-foreground">
                                {entry.description}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Field Cards List */}
              {activeSection.fields.length === 0 ? (
                <div className="empty-state rounded-xl border-dashed py-12">
                  <LayoutGrid className="mb-2 size-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">
                    No fields added to this step yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Click the &quot;+ Add Field&quot; button above to add
                    inputs, options, or layout text.
                  </p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext
                    items={activeSection.fields.map((field) => field.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex flex-col gap-3">
                      {activeSection.fields.map((field) => (
                        <SortableFieldRow
                          key={field.id}
                          field={field}
                          siblingKeys={activeSection.fields
                            .filter((other) => other.id !== field.id)
                            .map((other) => other.key)}
                          onChange={(next) => updateField(field.id, next)}
                          onDuplicate={() => duplicateField(field)}
                          onRemove={() => removeField(field.id)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          ) : (
            <div className="empty-state">
              Add a section to start building this form.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableSectionTab({
  section,
  index,
  active,
  onSelect,
  onRemove,
}: {
  section: FormSection;
  index: number;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 rounded-lg border bg-card p-2.5 shadow-2xs transition-all",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "hover:border-border/80 hover:bg-muted/30",
        isDragging && "builder-field-dragging",
      )}
    >
      <button
        type="button"
        className="drag-handle text-muted-foreground/60 hover:text-foreground"
        aria-label={`Reorder ${section.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
        data-testid={`section-tab-${index}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold text-muted-foreground">
            Step {index + 1}
          </span>
        </div>
        <span className="block truncate text-xs font-semibold">
          {section.title || "Untitled section"}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {section.fields.length} field{section.fields.length === 1 ? "" : "s"}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${section.title}`}
        onClick={onRemove}
        className="size-7 text-destructive/80 opacity-60 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function SortableFieldRow({
  field,
  siblingKeys,
  onChange,
  onDuplicate,
  onRemove,
}: {
  field: FormField;
  siblingKeys: string[];
  onChange: (next: FormField) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const Icon =
    FIELD_PALETTE.find((entry) => entry.type === field.type)?.icon ?? Type;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border bg-card shadow-2xs transition-all hover:shadow-xs",
        expanded && "border-primary/40 ring-1 ring-primary/30",
        isDragging && "builder-field-dragging",
      )}
      data-testid={`field-row-${field.key}`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          className="drag-handle text-muted-foreground/60 hover:text-foreground"
          aria-label={`Reorder ${field.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold">
              {field.label || "Untitled field"}
            </p>
          </div>
          {isDisplayField(field.type) ? (
            <p className="text-[11px] text-muted-foreground italic">
              Static Display Element
            </p>
          ) : (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              key: {field.key}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="hidden text-[11px] sm:inline-flex"
          >
            {fieldTypeLabel(field.type)}
          </Badge>
          {!isDisplayField(field.type) && field.width === "half" ? (
            <Badge
              variant="outline"
              className="hidden border-dashed text-[11px] sm:inline-flex"
            >
              Half Row
            </Badge>
          ) : null}
          {field.required ? (
            <Badge
              variant="secondary"
              className="border-primary/20 bg-primary/10 text-[11px] font-medium text-primary"
            >
              Required
            </Badge>
          ) : null}
        </div>

        <div className="ml-1 flex items-center gap-0.5 border-l pl-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Duplicate ${field.label}`}
            onClick={onDuplicate}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${field.label}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Edit"} ${field.label}`}
            onClick={() => setExpanded((current) => !current)}
            data-testid={`field-toggle-${field.key}`}
          >
            {expanded ? (
              <ChevronUp className="size-4 font-bold text-primary" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="px-3 pb-3">
          <FieldEditor
            field={field}
            onChange={onChange}
            siblingKeys={siblingKeys}
          />
        </div>
      ) : null}
    </li>
  );
}

function allKeys(form: FormSchema): string[] {
  return form.sections.flatMap((section) =>
    section.fields.map((field) => field.key),
  );
}

function uniqueKey(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

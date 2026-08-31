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
  GripVertical,
  Hash,
  Heading,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Text,
  Trash2,
  Type,
} from "lucide-react";
import { useState, type ComponentType } from "react";

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
}[] = [
  { type: "text", label: "Short text", icon: Type, group: "Input" },
  { type: "textarea", label: "Long text", icon: AlignLeft, group: "Input" },
  { type: "number", label: "Number", icon: Hash, group: "Input" },
  { type: "email", label: "Email", icon: Mail, group: "Input" },
  { type: "phone", label: "Phone", icon: Phone, group: "Input" },
  { type: "date", label: "Date", icon: Calendar, group: "Input" },
  { type: "select", label: "Dropdown", icon: ListChecks, group: "Choice" },
  { type: "radio", label: "Single choice", icon: CircleDot, group: "Choice" },
  {
    type: "multiselect",
    label: "Multiple choice",
    icon: ListChecks,
    group: "Choice",
  },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, group: "Choice" },
  { type: "file", label: "File upload", icon: Paperclip, group: "Upload" },
  { type: "heading", label: "Heading", icon: Heading, group: "Layout" },
  { type: "paragraph", label: "Paragraph", icon: Text, group: "Layout" },
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

  const activeSection =
    value.sections.find((section) => section.id === activeSectionId) ??
    value.sections[0] ??
    null;

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
    <div className="builder-grid">
      {/* Sections ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Sections
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addSection}
            data-testid="add-section"
          >
            <Plus className="size-4" />
            Add
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
            <ul className="flex flex-col gap-1.5">
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
          <p className="text-sm text-muted-foreground">
            A form needs at least one section. Each section becomes one page of
            the wizard.
          </p>
        ) : null}
      </div>

      {/* Selected section -------------------------------------------- */}
      {activeSection ? (
        <div className="section-stack">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="section-title">Section title</FieldLabel>
              <Input
                id="section-title"
                value={activeSection.title}
                onChange={(event) =>
                  updateSection(activeSection.id, { title: event.target.value })
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
                value={activeSection.description}
                onChange={(event) =>
                  updateSection(activeSection.id, {
                    description: event.target.value,
                  })
                }
              />
            </Field>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Fields ({activeSection.fields.length})
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" data-testid="add-field">
                  <Plus className="size-4" />
                  Add field
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {PALETTE_GROUPS.map((group, groupIndex) => (
                  <div key={group}>
                    {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-xs">
                      {group}
                    </DropdownMenuLabel>
                    {FIELD_PALETTE.filter((entry) => entry.group === group).map(
                      (entry) => (
                        <DropdownMenuItem
                          key={entry.type}
                          onClick={() => addField(entry.type)}
                          data-testid={`add-field-${entry.type}`}
                        >
                          <entry.icon className="size-4" />
                          {entry.label}
                        </DropdownMenuItem>
                      ),
                    )}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {activeSection.fields.length === 0 ? (
            <div className="empty-state">
              This section has no fields yet. Add one from the menu above.
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
                <ul className="flex flex-col gap-2">
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
        "flex items-center gap-1.5 rounded-md border bg-card p-2",
        active && "border-primary bg-accent",
        isDragging && "builder-field-dragging",
      )}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Reorder ${section.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left text-sm"
        data-testid={`section-tab-${index}`}
      >
        <span className="block truncate font-medium">
          {section.title || "Untitled section"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {section.fields.length} field{section.fields.length === 1 ? "" : "s"}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${section.title}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
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
        "rounded-md border bg-card",
        isDragging && "builder-field-dragging",
      )}
      data-testid={`field-row-${field.key}`}
    >
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          className="drag-handle"
          aria-label={`Reorder ${field.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <Icon className="size-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {field.label || "Untitled field"}
          </p>
          {isDisplayField(field.type) ? null : (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {field.key}
            </p>
          )}
        </div>

        <Badge variant="outline" className="hidden sm:inline-flex">
          {fieldTypeLabel(field.type)}
        </Badge>
        {field.required ? <Badge variant="secondary">Required</Badge> : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Duplicate ${field.label}`}
          onClick={onDuplicate}
        >
          <Copy className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete ${field.label}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Edit"} ${field.label}`}
          onClick={() => setExpanded((current) => !current)}
          data-testid={`field-toggle-${field.key}`}
        >
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </div>

      {expanded ? (
        <div className="px-2.5 pb-3">
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

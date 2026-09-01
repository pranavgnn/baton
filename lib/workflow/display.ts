import { isFileValue, valueColumns } from "./form";
import {
  isDisplayField,
  isRowArray,
  type AnyField,
  type ColumnField,
  type FileValue,
  type FormField,
  type FormSchema,
  type RowValue,
  type SectionData,
} from "./types";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** One entry of a repeating group, ready to render as a labelled list. */
export type DisplayRow = {
  cells: { field: ColumnField; value: DisplayValue }[];
};

export type DisplayValue =
  | { kind: "text"; value: string }
  | { kind: "files"; files: FileValue[] }
  | { kind: "rows"; rows: DisplayRow[] };

/** Turns a stored answer into something readable for previews and reviews. */
export function displayValue(field: AnyField, raw: unknown): DisplayValue {
  if (field.type === "repeater") {
    const rows = isRowArray(raw) ? (raw as RowValue[]) : [];
    const columns = valueColumns(field);
    return {
      kind: "rows",
      rows: rows.map((row) => ({
        cells: columns.map((column) => ({
          field: column,
          value: displayValue(column, row[column.key]),
        })),
      })),
    };
  }

  if (field.type === "file") {
    const files = Array.isArray(raw)
      ? raw.filter(isFileValue)
      : isFileValue(raw)
        ? [raw]
        : [];
    return { kind: "files", files };
  }

  if (raw === undefined || raw === null || raw === "") {
    return { kind: "text", value: "-" };
  }

  switch (field.type) {
    case "checkbox":
      return { kind: "text", value: raw === true ? "Yes" : "No" };

    case "date": {
      const parsed = new Date(String(raw));
      return {
        kind: "text",
        value: Number.isNaN(parsed.getTime())
          ? String(raw)
          : dateFormatter.format(parsed),
      };
    }

    case "select":
    case "radio": {
      const option = field.options.find((entry) => entry.value === raw);
      return { kind: "text", value: option?.label ?? String(raw) };
    }

    case "multiselect": {
      const values = Array.isArray(raw) ? raw : [raw];
      if (values.length === 0) return { kind: "text", value: "-" };
      return {
        kind: "text",
        value: values
          .map(
            (value) =>
              field.options.find((entry) => entry.value === value)?.label ??
              String(value),
          )
          .join(", "),
      };
    }

    default:
      return { kind: "text", value: String(raw) };
  }
}

export type PreviewSection = {
  id: string;
  title: string;
  description: string;
  rows: { field: FormField; value: DisplayValue }[];
};

/** Flattens a form definition plus its data into rows ready for rendering. */
export function buildPreview(
  form: FormSchema,
  data: SectionData | undefined | null,
): PreviewSection[] {
  return form.sections.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    rows: section.fields
      .filter((field) => !isDisplayField(field.type))
      .map((field) => ({
        field,
        value: displayValue(field, data?.[field.key]),
      })),
  }));
}

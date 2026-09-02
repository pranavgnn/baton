import { isFieldVisible } from "@/lib/workflow/conditions";
import { displayValue } from "@/lib/workflow/display";
import { valueColumns } from "@/lib/workflow/form";
import { orderedStageNodes, startNode } from "@/lib/workflow/graph";
import {
  APPLICANT_NAMESPACE,
  type ApplicationData,
  type FileValue,
  type FormField,
  type FormSchema,
  type SectionData,
  type WorkflowGraph,
} from "@/lib/workflow/types";

/**
 * The printable shape of an application, derived from whatever form the admin
 * happens to have defined.
 *
 * Deliberately pure and free of React, `@react-pdf/renderer` and the database:
 * the interesting decisions here are about layout - which answers become a
 * two-column table of particulars and which become a grid with a header row -
 * and those are worth testing without rendering anything.
 */

export type PdfBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  /** Consecutive plain answers, printed as the paper form's label/value grid. */
  | { kind: "pairs"; rows: { label: string; value: string }[] }
  /** A repeating group, printed as a table with one row per entry. */
  | {
      kind: "table";
      label: string;
      columns: string[];
      rows: string[][];
      /** Entries are numbered, as every table on the paper form is. */
      numbered: boolean;
    }
  | { kind: "attachments"; label: string; files: FileValue[] };

export type PdfSection = {
  title: string;
  description: string;
  blocks: PdfBlock[];
};

/**
 * One signed part of the document: the applicant's submission, then each
 * review that has been completed, in the order the application passed through
 * them.
 */
export type PdfPart = {
  title: string;
  description: string;
  sections: PdfSection[];
  signature: { name: string; at: string } | null;
};

export type PdfModel = {
  title: string;
  reference: string;
  status: string;
  /** Rendered under the reference, e.g. "Test Employee · Assistant Professor". */
  applicantLine: string;
  parts: PdfPart[];
  /** Every uploaded file, in the order it appears in the document. */
  attachments: FileValue[];
  generatedAt: string;
};

export type PdfModelInput = {
  graph: WorkflowGraph;
  data: ApplicationData | null;
  reference: string;
  status: string;
  applicant: { name: string; email: string; designation: string | null };
  /** Completed stages, keyed by node id: who signed, and when. */
  signatures: Record<string, { name: string; at: string }>;
  generatedAt: string;
};

export function buildPdfModel(input: PdfModelInput): PdfModel {
  const parts: PdfPart[] = [];
  const start = startNode(input.graph);

  if (start) {
    parts.push({
      title: start.data.label,
      description: start.data.description ?? "",
      sections: buildSections(
        start.data.form,
        input.data?.[APPLICANT_NAMESPACE] ?? null,
      ),
      signature: input.signatures[start.id] ?? null,
    });
  }

  // Only the stages that have actually been through: a review nobody has done
  // yet has nothing to print, and printing an empty block would read as though
  // the reviewer had signed off on nothing.
  for (const node of orderedStageNodes(input.graph)) {
    if (node.kind !== "stage") continue;
    const answers = input.data?.[node.id];
    if (!answers) continue;

    parts.push({
      title: node.data.label,
      description: node.data.description ?? "",
      sections: buildSections(node.data.form, answers),
      signature: input.signatures[node.id] ?? null,
    });
  }

  const applicantLine = [input.applicant.name, input.applicant.designation]
    .filter(Boolean)
    .join(" · ");

  return {
    title: "Application for promotion",
    reference: input.reference,
    status: input.status,
    applicantLine: applicantLine || input.applicant.email,
    parts,
    attachments: collectAttachments(parts),
    generatedAt: input.generatedAt,
  };
}

/**
 * Turns one form and its answers into printable blocks.
 *
 * Plain answers run together into a single table so the particulars at the top
 * of the paper form come out as the one grid they are, and a repeating group
 * breaks that run to become a table of its own.
 */
export function buildSections(
  form: FormSchema,
  data: SectionData | null | undefined,
): PdfSection[] {
  return form.sections.map((section) => {
    const blocks: PdfBlock[] = [];
    let pairs: { label: string; value: string }[] = [];

    const flushPairs = () => {
      if (pairs.length > 0) blocks.push({ kind: "pairs", rows: pairs });
      pairs = [];
    };

    for (const field of section.fields) {
      if (field.type === "heading") {
        flushPairs();
        blocks.push({ kind: "heading", text: field.label });
        continue;
      }
      if (field.type === "paragraph") {
        flushPairs();
        blocks.push({
          kind: "paragraph",
          text: field.description || field.label,
        });
        continue;
      }

      // A question that did not apply was never asked, so it is left out
      // rather than printed blank.
      if (!isFieldVisible(field, data ?? {})) continue;

      const value = displayValue(field, data?.[field.key]);

      if (value.kind === "rows") {
        flushPairs();
        blocks.push(tableBlock(field, data?.[field.key]));
        continue;
      }

      if (value.kind === "files") {
        flushPairs();
        blocks.push({
          kind: "attachments",
          label: field.label,
          files: value.files,
        });
        continue;
      }

      pairs.push({ label: field.label, value: value.value });
    }

    flushPairs();

    return {
      title: section.title,
      description: section.description ?? "",
      blocks,
    };
  });
}

/**
 * A repeating group as a grid.
 *
 * The header comes from the group's columns rather than from any one entry, so
 * every row lines up even when a rule hid a column for some of them - a hidden
 * cell prints empty, which is what the paper form does too.
 */
function tableBlock(field: FormField, raw: unknown): PdfBlock {
  const columns = valueColumns(field);
  const entries = Array.isArray(raw) ? raw : [];

  const rows = entries.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return columns.map((column) => {
      if (!isFieldVisible(column, row as SectionData)) return "";
      const value = displayValue(column, row[column.key]);
      if (value.kind === "text") return value.value;
      if (value.kind === "files") {
        return value.files.map((file) => file.name).join(", ");
      }
      return "";
    });
  });

  return {
    kind: "table",
    label: field.label,
    columns: columns.map((column) => column.label),
    rows,
    numbered: true,
  };
}

/** Every attachment in the document, in reading order and without repeats. */
function collectAttachments(parts: PdfPart[]): FileValue[] {
  const seen = new Set<string>();
  const files: FileValue[] = [];

  for (const part of parts) {
    for (const section of part.sections) {
      for (const block of section.blocks) {
        if (block.kind !== "attachments") continue;
        for (const file of block.files) {
          if (seen.has(file.id)) continue;
          seen.add(file.id);
          files.push(file);
        }
      }
    }
  }

  return files;
}

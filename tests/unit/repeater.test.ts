import { describe, expect, it } from "vitest";

import { createField, createRepeater } from "@/lib/workflow/defaults";
import {
  buildDefaultValues,
  collectFiles,
  emptyRow,
  pruneToSchema,
  validateForm,
} from "@/lib/workflow/form";
import { displayValue } from "@/lib/workflow/display";
import type { FormSchema } from "@/lib/workflow/types";

/**
 * A repeating group is the one field whose answer is not a single value, so
 * everything that walks a form - validation, defaults, pruning, file
 * collection, display - has to descend into it.
 */

const qualifications = createRepeater(
  { key: "qualifications", label: "Qualifications", required: true },
  [
    createField({
      type: "text",
      key: "qualification",
      label: "Qualification",
      required: true,
    }),
    createField({
      type: "number",
      key: "year",
      label: "Year",
      required: true,
      validation: { min: 1950, max: 2100 },
    }),
    createField({ type: "text", key: "remarks", label: "Remarks" }),
  ],
);

const form: FormSchema = {
  sections: [
    {
      id: "sec_1",
      title: "Academic record",
      description: "",
      fields: [qualifications],
    },
  ],
};

const validRow = { qualification: "Ph.D.", year: 2016, remarks: "" };

describe("validating a repeating group", () => {
  it("accepts entries whose columns are all filled in", () => {
    const result = validateForm(form, { qualifications: [validRow] });
    expect(result.ok).toBe(true);
  });

  it("accepts several entries", () => {
    const result = validateForm(form, {
      qualifications: [validRow, { qualification: "M.Tech.", year: 2010 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.qualifications).toHaveLength(2);
    }
  });

  it("insists on one entry when the group is required", () => {
    const result = validateForm(form, { qualifications: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.qualifications).toBe(
        "Qualifications needs at least one entry",
      );
    }
  });

  it("reports a bad column against that entry, not the group", () => {
    const result = validateForm(form, {
      qualifications: [validRow, { qualification: "", year: 2010 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The path names the entry, so the message lands on the input.
      expect(result.errors["qualifications.1.qualification"]).toBe(
        "Qualification is required",
      );
    }
  });

  it("applies a column's own validation inside every entry", () => {
    const result = validateForm(form, {
      qualifications: [{ qualification: "Ph.D.", year: 1899 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors["qualifications.0.year"]).toBe(
        "Year must be at least 1950",
      );
    }
  });

  it("lets an optional group be left empty", () => {
    const optional: FormSchema = {
      sections: [
        {
          ...form.sections[0]!,
          fields: [{ ...qualifications, required: false }],
        },
      ],
    };

    expect(validateForm(optional, { qualifications: [] }).ok).toBe(true);
  });

  it("enforces the fewest and most entries a group allows", () => {
    const bounded: FormSchema = {
      sections: [
        {
          ...form.sections[0]!,
          fields: [
            {
              ...qualifications,
              required: false,
              validation: { minRows: 2, maxRows: 3 },
            },
          ],
        },
      ],
    };

    expect(validateForm(bounded, { qualifications: [validRow] }).ok).toBe(
      false,
    );
    expect(
      validateForm(bounded, {
        qualifications: [validRow, validRow, validRow, validRow],
      }).ok,
    ).toBe(false);
    expect(
      validateForm(bounded, { qualifications: [validRow, validRow] }).ok,
    ).toBe(true);
  });

  it("treats a value that is not a list of entries as none", () => {
    // A stale client, or a group that used to be a plain text field.
    const result = validateForm(form, { qualifications: "Ph.D. 2016" });
    expect(result.ok).toBe(false);
  });
});

describe("defaults and pruning", () => {
  it("opens a required group with one blank entry", () => {
    const values = buildDefaultValues(form, null);
    expect(values.qualifications).toEqual([
      { qualification: "", year: "", remarks: "" },
    ]);
  });

  it("opens an optional group with none", () => {
    const optional = { ...qualifications, required: false };
    expect(
      buildDefaultValues(
        { sections: [{ ...form.sections[0]!, fields: [optional] }] },
        null,
      ).qualifications,
    ).toEqual([]);
  });

  it("fills a saved entry out against the columns as they are now", () => {
    // `remarks` was added after this entry was saved.
    const values = buildDefaultValues(form, {
      qualifications: [{ qualification: "Ph.D.", year: 2016 }],
    });

    expect(values.qualifications).toEqual([
      { qualification: "Ph.D.", year: 2016, remarks: "" },
    ]);
  });

  it("drops answers to a column the group no longer has", () => {
    const pruned = pruneToSchema(form, {
      qualifications: [
        { qualification: "Ph.D.", year: 2016, university: "MAHE" },
      ],
    });

    expect(pruned.qualifications).toEqual([
      { qualification: "Ph.D.", year: 2016 },
    ]);
  });

  it("builds a blank entry from the columns", () => {
    expect(emptyRow(qualifications)).toEqual({
      qualification: "",
      year: "",
      remarks: "",
    });
  });
});

describe("uploads inside a repeating group", () => {
  const withFile = createRepeater({ key: "papers", label: "Papers" }, [
    createField({ type: "text", key: "title", label: "Title" }),
    createField({ type: "file", key: "scan", label: "First page" }),
  ]);

  const fileForm: FormSchema = {
    sections: [
      { id: "sec_1", title: "Papers", description: "", fields: [withFile] },
    ],
  };

  it("collects every upload so each one is attached to the application", () => {
    const files = collectFiles(fileForm, {
      papers: [
        {
          title: "One",
          scan: {
            id: "f1",
            key: "k1",
            name: "one.pdf",
            size: 10,
            contentType: "application/pdf",
          },
        },
        {
          title: "Two",
          scan: {
            id: "f2",
            key: "k2",
            name: "two.pdf",
            size: 20,
            contentType: "application/pdf",
          },
        },
      ],
    });

    expect(files.map((file) => file.id)).toEqual(["f1", "f2"]);
  });
});

describe("reading a repeating group back", () => {
  it("renders each entry as its labelled columns", () => {
    const value = displayValue(qualifications, [
      { qualification: "Ph.D.", year: 2016, remarks: "" },
    ]);

    expect(value.kind).toBe("rows");
    if (value.kind === "rows") {
      expect(value.rows).toHaveLength(1);
      expect(value.rows[0]!.cells.map((cell) => cell.field.label)).toEqual([
        "Qualification",
        "Year",
        "Remarks",
      ]);
      expect(value.rows[0]!.cells[0]!.value).toEqual({
        kind: "text",
        value: "Ph.D.",
      });
    }
  });

  it("reads an unanswered group as no entries", () => {
    const value = displayValue(qualifications, undefined);
    expect(value).toEqual({ kind: "rows", rows: [] });
  });
});

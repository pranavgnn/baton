import { describe, expect, it } from "vitest";

import { createField, createSection } from "@/lib/workflow/defaults";
import {
  buildDefaultValues,
  buildFieldSchema,
  buildSectionSchema,
  collectFiles,
  isEmptyValue,
  pruneToSchema,
  validateForm,
  validateSection,
  valueFields,
} from "@/lib/workflow/form";
import type { FileValue, FormField, FormSchema } from "@/lib/workflow/types";

function parse(field: FormField, value: unknown) {
  return buildFieldSchema(field).safeParse(value);
}

function messageFor(field: FormField, value: unknown): string | undefined {
  const result = parse(field, value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

const pdf: FileValue = {
  id: "file-1",
  key: "uploads/cv.pdf",
  name: "cv.pdf",
  size: 1024,
  contentType: "application/pdf",
};

describe("text fields", () => {
  const required = createField({
    type: "text",
    key: "full_name",
    label: "Full name",
    required: true,
    validation: { minLength: 3, maxLength: 10 },
  });

  it("reports the required message for an empty value, not the length rule", () => {
    expect(messageFor(required, "")).toBe("Full name is required");
  });

  it("applies the length rules once a value is present", () => {
    expect(messageFor(required, "ab")).toBe(
      "Full name must be at least 3 characters",
    );
    expect(messageFor(required, "a".repeat(11))).toBe(
      "Full name must be at most 10 characters",
    );
    expect(parse(required, "Anita").success).toBe(true);
  });

  it("uses the admin's own message when a pattern fails", () => {
    const field = createField({
      type: "text",
      key: "employee_id",
      label: "Employee ID",
      required: true,
      validation: {
        pattern: "^EMP-[0-9]{4}$",
        patternMessage: "Use the EMP-1234 format",
      },
    });
    expect(messageFor(field, "nope")).toBe("Use the EMP-1234 format");
    expect(parse(field, "EMP-4471").success).toBe(true);
  });

  it("ignores an unparseable pattern instead of throwing", () => {
    const field = createField({
      type: "text",
      key: "x",
      label: "X",
      required: true,
      validation: { pattern: "([unclosed" },
    });
    expect(parse(field, "anything").success).toBe(true);
  });

  it("treats a blank optional field as absent", () => {
    const field = createField({ type: "text", key: "x", label: "X" });
    expect(parse(field, "").success).toBe(true);
  });
});

describe("typed fields", () => {
  it("validates email addresses", () => {
    const field = createField({
      type: "email",
      key: "email",
      label: "Email",
      required: true,
    });
    expect(messageFor(field, "")).toBe("Email is required");
    expect(messageFor(field, "nope")).toBe(
      "Email must be a valid email address",
    );
    expect(parse(field, "a@b.edu").success).toBe(true);
  });

  it("validates phone numbers", () => {
    const field = createField({
      type: "phone",
      key: "phone",
      label: "Phone",
      required: true,
    });
    expect(messageFor(field, "abc")).toBe("Phone must be a valid phone number");
    expect(parse(field, "+91 98450 12345").success).toBe(true);
  });

  it("coerces numeric strings and enforces bounds", () => {
    const field = createField({
      type: "number",
      key: "score",
      label: "Score",
      required: true,
      validation: { min: 0, max: 10 },
    });
    expect(parse(field, "7").success).toBe(true);
    expect(parse(field, "7")).toMatchObject({ data: 7 });
    expect(messageFor(field, "")).toBe("Score is required");
    expect(messageFor(field, "11")).toBe("Score must be at most 10");
    expect(messageFor(field, "-1")).toBe("Score must be at least 0");
    expect(messageFor(field, "abc")).toBe("Score must be a number");
  });

  it("accepts an omitted optional number", () => {
    const field = createField({ type: "number", key: "n", label: "N" });
    expect(parse(field, "").success).toBe(true);
  });

  it("requires ISO dates", () => {
    const field = createField({
      type: "date",
      key: "doj",
      label: "Date of joining",
      required: true,
    });
    expect(messageFor(field, "18/07/2016")).toBe(
      "Date of joining must be a valid date",
    );
    expect(parse(field, "2016-07-18").success).toBe(true);
  });

  it("restricts select values to the configured options", () => {
    const field = createField({
      type: "select",
      key: "dept",
      label: "Department",
      required: true,
      options: [{ id: "o1", label: "CSE", value: "cse" }],
    });
    expect(parse(field, "cse").success).toBe(true);
    expect(messageFor(field, "mech")).toBe(
      "Department must be one of the listed options",
    );
  });

  it("requires at least one choice for a required multiselect", () => {
    const field = createField({
      type: "multiselect",
      key: "areas",
      label: "Areas",
      required: true,
      options: [
        { id: "o1", label: "A", value: "a" },
        { id: "o2", label: "B", value: "b" },
      ],
    });
    expect(messageFor(field, [])).toBe("Areas is required");
    expect(parse(field, ["a", "b"]).success).toBe(true);
    expect(messageFor(field, ["a", "zzz"])).toBe(
      "Areas contains an option that is not available",
    );
  });

  it("requires a ticked required checkbox", () => {
    const field = createField({
      type: "checkbox",
      key: "declaration",
      label: "I declare",
      required: true,
    });
    expect(messageFor(field, false)).toBe("I declare is required");
    expect(parse(field, true).success).toBe(true);
  });

  it("skips display-only fields", () => {
    const heading = createField({
      type: "heading",
      key: "h",
      label: "Section heading",
    });
    expect(parse(heading, undefined).success).toBe(true);
  });
});

describe("file fields", () => {
  const single = createField({
    type: "file",
    key: "cv",
    label: "CV",
    required: true,
    validation: {
      maxFileSizeMb: 1,
      acceptedFileTypes: ["application/pdf"],
      maxFiles: 1,
    },
  });

  it("accepts a file within the configured limits", () => {
    expect(parse(single, pdf).success).toBe(true);
  });

  it("rejects a file over the size limit", () => {
    expect(messageFor(single, { ...pdf, size: 5 * 1024 * 1024 })).toBe(
      "cv.pdf exceeds the 1 MB limit",
    );
  });

  it("rejects a file whose type is not accepted", () => {
    expect(
      messageFor(single, { ...pdf, name: "cv.png", contentType: "image/png" }),
    ).toBe("cv.png is not an accepted file type");
  });

  it("matches extension and wildcard accept rules", () => {
    const field = createField({
      type: "file",
      key: "proof",
      label: "Proof",
      required: true,
      validation: { acceptedFileTypes: [".pdf", "image/*"], maxFiles: 1 },
    });
    expect(parse(field, pdf).success).toBe(true);
    expect(
      parse(field, { ...pdf, name: "scan.png", contentType: "image/png" })
        .success,
    ).toBe(true);
    expect(
      parse(field, { ...pdf, name: "doc.txt", contentType: "text/plain" })
        .success,
    ).toBe(false);
  });

  it("enforces the maximum number of files", () => {
    const many = createField({
      type: "file",
      key: "proofs",
      label: "Proofs",
      required: true,
      validation: { maxFiles: 2 },
    });
    expect(messageFor(many, [])).toBe("Proofs is required");
    expect(parse(many, [pdf, { ...pdf, id: "f2" }]).success).toBe(true);
    expect(
      messageFor(many, [pdf, { ...pdf, id: "f2" }, { ...pdf, id: "f3" }]),
    ).toBe("Proofs accepts at most 2 files");
  });
});

describe("section and form schemas", () => {
  const form: FormSchema = {
    sections: [
      createSection("One", [
        createField({ type: "text", key: "a", label: "A", required: true }),
        createField({ type: "heading", key: "h", label: "Heading" }),
      ]),
      createSection("Two", [
        createField({ type: "text", key: "b", label: "B", required: true }),
      ]),
    ],
  };

  it("excludes display fields from the value set", () => {
    expect(valueFields(form.sections[0]).map((f) => f.key)).toEqual(["a"]);
  });

  it("validates one section without demanding the others", () => {
    const result = validateSection(form.sections[0], { a: "value" });
    expect(result.ok).toBe(true);
  });

  it("collects an error per field on a full-form check", () => {
    const result = validateForm(form, { a: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      a: "A is required",
      b: "B is required",
    });
  });

  it("builds a section schema covering only that section's keys", () => {
    const shape = buildSectionSchema(form.sections[1]).shape;
    expect(Object.keys(shape)).toEqual(["b"]);
  });
});

describe("defaults and pruning", () => {
  const form: FormSchema = {
    sections: [
      createSection("One", [
        createField({ type: "text", key: "name", label: "Name" }),
        createField({ type: "checkbox", key: "agree", label: "Agree" }),
        createField({
          type: "multiselect",
          key: "areas",
          label: "Areas",
          options: [],
        }),
        createField({
          type: "file",
          key: "proofs",
          label: "Proofs",
          validation: { maxFiles: 3 },
        }),
        createField({ type: "file", key: "cv", label: "CV" }),
      ]),
    ],
  };

  it("produces a controlled value for every field", () => {
    expect(buildDefaultValues(form, null)).toEqual({
      name: "",
      agree: false,
      areas: [],
      proofs: [],
      cv: null,
    });
  });

  it("layers saved answers over the blank defaults", () => {
    expect(buildDefaultValues(form, { name: "Anita" })).toMatchObject({
      name: "Anita",
      agree: false,
    });
  });

  it("drops values whose fields have been deleted from the form", () => {
    expect(pruneToSchema(form, { name: "Anita", removed: "x" })).toEqual({
      name: "Anita",
    });
  });

  it("collects every uploaded file across single and multi fields", () => {
    const files = collectFiles(form, {
      cv: pdf,
      proofs: [
        { ...pdf, id: "f2" },
        { ...pdf, id: "f3" },
      ],
      name: "Anita",
    });
    expect(files.map((file) => file.id).sort()).toEqual(["f2", "f3", "file-1"]);
  });
});

describe("isEmptyValue", () => {
  it.each([
    [undefined, true],
    [null, true],
    ["", true],
    ["   ", true],
    [[], true],
    ["x", false],
    [0, false],
    [false, false],
    [["a"], false],
  ])("treats %j as empty=%s", (value, expected) => {
    expect(isEmptyValue(value)).toBe(expected);
  });
});

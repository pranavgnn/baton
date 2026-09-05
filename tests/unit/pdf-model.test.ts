import { describe, expect, it } from "vitest";

import { buildPdfModel, buildSections } from "@/lib/pdf/model";
import {
  createField,
  createRepeater,
  createSection,
} from "@/lib/workflow/defaults";
import {
  APPLICANT_NAMESPACE,
  type ApplicationData,
} from "@/lib/workflow/types";
import { buildGraph } from "./fixtures";

const file = (id: string, name: string) => ({
  id,
  key: `uploads/${id}`,
  name,
  size: 1024,
  contentType: "application/pdf",
});

describe("printable sections", () => {
  it("runs consecutive answers together and breaks the run for a table", () => {
    const sections = buildSections(
      {
        sections: [
          createSection("Particulars", [
            createField({ type: "text", key: "name", label: "Full name" }),
            createField({ type: "text", key: "code", label: "Employee code" }),
            createRepeater({ key: "quals", label: "Qualifications" }, [
              createField({ type: "text", key: "degree", label: "Degree" }),
              createField({ type: "number", key: "year", label: "Year" }),
            ]),
            createField({ type: "text", key: "note", label: "Remarks" }),
          ]),
        ],
      },
      {
        name: "Test Employee",
        code: "TEST-1",
        quals: [{ degree: "PhD", year: 2019 }],
        note: "None",
      },
    );

    // Two grids around one table, rather than four separate blocks: the paper
    // form prints a run of particulars as a single bordered grid.
    expect(sections[0].blocks.map((block) => block.kind)).toEqual([
      "pairs",
      "table",
      "pairs",
    ]);

    const [particulars, quals] = sections[0].blocks;
    expect(particulars).toMatchObject({
      rows: [
        { label: "Full name", value: "Test Employee" },
        { label: "Employee code", value: "TEST-1" },
      ],
    });
    expect(quals).toMatchObject({
      label: "Qualifications",
      columns: ["Degree", "Year"],
      rows: [["PhD", "2019"]],
      numbered: true,
    });
  });

  it("keeps a table rectangular when a rule hid a column for one entry", () => {
    const other = createField({
      type: "text",
      key: "other",
      label: "Other institution",
    });
    const columns = [
      createField({ type: "text", key: "kind", label: "Kind" }),
      {
        ...other,
        visibleWhen: {
          mode: "all" as const,
          rules: [
            {
              id: "r1",
              field: "kind",
              operator: "equals" as const,
              value: "external",
            },
          ],
        },
      },
    ];

    const [section] = buildSections(
      {
        sections: [
          createSection("Experience", [
            createRepeater({ key: "posts", label: "Appointments" }, columns),
          ]),
        ],
      },
      {
        posts: [
          { kind: "external", other: "Elsewhere" },
          { kind: "internal", other: "ignored" },
        ],
      },
    );

    expect(section.blocks[0]).toMatchObject({
      columns: ["Kind", "Other institution"],
      // The hidden cell prints empty rather than shifting the row left.
      rows: [
        ["external", "Elsewhere"],
        ["internal", ""],
      ],
    });
  });

  it("leaves out a question a rule hid, and lists attached files as their own block", () => {
    const [section] = buildSections(
      {
        sections: [
          createSection("Evidence", [
            createField({
              type: "checkbox",
              key: "has_patent",
              label: "Patent?",
            }),
            {
              ...createField({
                type: "text",
                key: "patent_no",
                label: "Patent number",
              }),
              visibleWhen: {
                mode: "all" as const,
                rules: [
                  {
                    id: "r1",
                    field: "has_patent",
                    operator: "isChecked" as const,
                    value: "",
                  },
                ],
              },
            },
            createField({ type: "file", key: "proof", label: "Proof" }),
          ]),
        ],
      },
      {
        has_patent: false,
        patent_no: "never asked",
        proof: [file("f1", "a.pdf")],
      },
    );

    expect(section.blocks).toEqual([
      { kind: "pairs", rows: [{ label: "Patent?", value: "No" }] },
      {
        kind: "attachments",
        label: "Proof",
        files: [expect.objectContaining({ id: "f1" })],
      },
    ]);
  });
});

describe("the document as a whole", () => {
  const { graph: base } = buildGraph();
  const stageId = base.nodes.find((node) => node.kind === "stage")!.id;

  /** The same graph, with a submission form that asks for files twice. */
  const graph = {
    ...base,
    nodes: base.nodes.map((node) =>
      node.kind === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              form: {
                sections: [
                  createSection("Evidence", [
                    createField({ type: "file", key: "a", label: "A" }),
                    createField({ type: "file", key: "b", label: "B" }),
                  ]),
                ],
              },
            },
          }
        : node,
    ),
  };

  const model = (data: ApplicationData) =>
    buildPdfModel({
      graph,
      data,
      reference: "PROM-2026-0001",
      status: "In progress",
      applicant: {
        name: "Test Employee",
        email: "employee@manipal.edu",
        designation: "Assistant Professor",
      },
      signatures: { [stageId]: { name: "Test Head", at: "2 Sep 2026" } },
      generatedAt: "2 Sep 2026",
    });

  it("prints the submission plus only the reviews that have been signed off", () => {
    const withoutReview = model({ [APPLICANT_NAMESPACE]: {} });
    expect(withoutReview.parts).toHaveLength(1);
    // Nobody signed the submission in this fixture, and an unsigned part
    // prints a blank line rather than inventing one.
    expect(withoutReview.parts[0].signature).toBeNull();

    const withReview = model({
      [APPLICANT_NAMESPACE]: {},
      [stageId]: { full_name: "Recommended" },
    });
    expect(withReview.parts).toHaveLength(2);
    expect(withReview.parts[1].signature).toEqual({
      name: "Test Head",
      at: "2 Sep 2026",
    });
  });

  it("gathers every enclosure once, in the order it is referred to", () => {
    const shared = file("f1", "degree.pdf");
    const built = model({
      [APPLICANT_NAMESPACE]: {
        a: [shared],
        b: [shared, file("f2", "extra.pdf")],
      },
    });

    // Attached twice, enclosed once: the same upload must not be appended to
    // the file two times.
    expect(built.attachments.map((entry) => entry.id)).toEqual(["f1", "f2"]);
  });

  it("names the applicant under the reference", () => {
    expect(model({}).applicantLine).toBe("Test Employee · Assistant Professor");
  });
});

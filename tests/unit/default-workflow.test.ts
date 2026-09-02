import { describe, expect, it } from "vitest";

import { isFieldVisible } from "@/lib/workflow/conditions";

import {
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_ROLES,
  defaultApplicantForm,
  defaultWorkflowGraph,
} from "@/lib/workflow/defaults";
import {
  continuationNodeId,
  hasBlockingIssues,
  nodeById,
  validateGraph,
} from "@/lib/workflow/graph";
import type { StageNode } from "@/lib/workflow/types";

/**
 * The seeded process is the one STN 023 R5 and Evaluation Form V2 describe.
 * These assertions are about that shape, not about the builder: a workflow the
 * institute cannot recognise is worse than one that merely fails to publish.
 */

const roleIdByName = Object.fromEntries(
  DEFAULT_ROLES.map((role) => [role.name, `role_${role.name}`]),
);
const templateIdByName = Object.fromEntries(
  DEFAULT_EMAIL_TEMPLATES.map((template) => [
    template.name,
    `template_${template.name}`,
  ]),
);

function build() {
  return defaultWorkflowGraph({ roleIdByName, templateIdByName });
}

const context = {
  roleIds: Object.values(roleIdByName),
  templateIds: Object.values(templateIdByName),
};

function stage(id: string): StageNode {
  const node = nodeById(build(), id);
  if (!node || node.kind !== "stage") {
    throw new Error(`${id} is not a review stage`);
  }
  return node;
}

/** Follows the step that carries the application forward, ignoring email. */
function next(fromNodeId: string, outcomeLabel?: string): string | null {
  const graph = build();
  const node = nodeById(graph, fromNodeId);
  if (!node) return null;

  const handle =
    node.kind === "stage"
      ? (node.data.outcomes.find((o) => o.label === outcomeLabel)?.id ?? "")
      : "out";

  return continuationNodeId(graph, fromNodeId, handle);
}

describe("the seeded workflow", () => {
  it("is valid and can be published as it stands", () => {
    expect(hasBlockingIssues(validateGraph(build(), context))).toBe(false);
  });

  it("runs the review stages in the order the process defines", () => {
    expect(next("node_submission")).toBe("node_stage_dean");
    expect(next("node_stage_dean", "Send to associate dean")).toBe(
      "node_stage_associate_dean",
    );
    expect(next("node_stage_associate_dean", "Forward to HR")).toBe(
      "node_stage_hr_initial",
    );
    expect(next("node_stage_hr_initial", "Forward to R&C")).toBe(
      "node_stage_rc",
    );
    expect(next("node_stage_rc", "Forward to FD&W")).toBe("node_stage_fdw");
    expect(next("node_stage_fdw", "Forward to HR")).toBe("node_stage_hr_final");
    expect(next("node_stage_hr_final", "Eligible")).toBe("node_stage_director");
  });

  it("closes the application where the process says it closes", () => {
    expect(next("node_stage_hr_final", "Not eligible")).toBe(
      "node_end_ineligible",
    );
    expect(next("node_stage_director", "Approve")).toBe("node_end_approved");
    expect(next("node_stage_director", "Reject")).toBe("node_end_rejected");
  });

  it("gives the intermediate stages no way to close the file", () => {
    // R&C and FD&W may record an ineligibility, but it travels with the
    // application rather than stopping it: HR and the Director decide.
    for (const id of [
      "node_stage_dean",
      "node_stage_associate_dean",
      "node_stage_hr_initial",
      "node_stage_rc",
      "node_stage_fdw",
    ]) {
      expect(stage(id).data.outcomes).toHaveLength(1);
    }
  });

  it("makes the dean name the associate dean who reviews it next", () => {
    // The one stage that hands the file to a person rather than to a role.
    expect(stage("node_stage_dean").data.nominatesNext).toBe(true);

    for (const id of [
      "node_stage_associate_dean",
      "node_stage_hr_initial",
      "node_stage_rc",
      "node_stage_fdw",
      "node_stage_hr_final",
      "node_stage_director",
    ]) {
      expect(stage(id).data.nominatesNext).toBe(false);
    }
  });

  it("assigns each stage to the role that owns it", () => {
    expect(stage("node_stage_dean").data.roleId).toBe(roleIdByName["Dean"]);
    expect(stage("node_stage_associate_dean").data.roleId).toBe(
      roleIdByName["Associate Dean"],
    );
    expect(stage("node_stage_hr_initial").data.roleId).toBe(
      roleIdByName["HR Officer"],
    );
    expect(stage("node_stage_rc").data.roleId).toBe(
      roleIdByName["R&C Officer"],
    );
    expect(stage("node_stage_fdw").data.roleId).toBe(
      roleIdByName["FDW Officer"],
    );
    // HR sees the file twice, at the start and at the declaration.
    expect(stage("node_stage_hr_final").data.roleId).toBe(
      roleIdByName["HR Officer"],
    );
    expect(stage("node_stage_director").data.roleId).toBe(
      roleIdByName["Director"],
    );
  });

  it("notifies the applicant and the receiving team at every hand-off", () => {
    const graph = build();
    const emails = graph.nodes.filter((node) => node.kind === "email");

    // Nine triggers in the notification matrix, and every one of them fans out
    // to a message that is not on the path the application takes.
    expect(emails.length).toBeGreaterThanOrEqual(9);
    for (const email of emails) {
      expect(email.kind === "email" && email.data.templateId).toBeTruthy();
    }
  });

  it("sends the approved file to Institute HR for filing", () => {
    const archive = nodeById(build(), "node_email_archive");
    expect(archive?.kind).toBe("email");
    expect(archive?.kind === "email" && archive.data.recipientRoleId).toBe(
      roleIdByName["Institute HR"],
    );
  });
});

describe("the seeded applicant form", () => {
  const form = defaultApplicantForm();
  const titles = form.sections.map((section) => section.title);
  const keys = form.sections.flatMap((section) =>
    section.fields.map((field) => field.key),
  );

  it("carries every lettered section of the paper form", () => {
    for (const letter of ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H."]) {
      expect(titles.some((title) => title.startsWith(letter))).toBe(true);
    }
  });

  it("asks which post is being applied for", () => {
    const field = form.sections
      .flatMap((section) => section.fields)
      .find((entry) => entry.key === "post_applied_for");

    expect(field?.required).toBe(true);
    expect(field?.options.map((option) => option.label)).toEqual([
      "Assistant Professor Senior Scale",
      "Associate Professor",
      "Additional Professor",
      "Professor",
      "Senior Professor",
    ]);
  });

  it("covers all seventeen research accomplishment items", () => {
    const checklist = form.sections.find((section) =>
      section.title.startsWith("E."),
    )!;
    const numbered = checklist.fields.filter((field) =>
      /^\d+\./.test(field.label),
    );

    expect(numbered).toHaveLength(17);
  });

  it("leaves the items the paper form makes optional optional", () => {
    const fields = form.sections.flatMap((section) => section.fields);

    for (const key of ["sponsored_rd_amount", "utility_patents_granted"]) {
      expect(fields.find((field) => field.key === key)?.required).toBe(false);
    }
  });

  it("asks the tables of the paper form as repeating groups", () => {
    const fields = form.sections.flatMap((section) => section.fields);

    for (const key of [
      "qualifications",
      "previous_appointments",
      "conferences",
      "faculty_development",
    ]) {
      const group = fields.find((field) => field.key === key);
      expect(group?.type).toBe("repeater");
      expect(group?.fields.length).toBeGreaterThan(1);
    }
  });

  it("keeps each column of a table typed rather than free text", () => {
    const fields = form.sections.flatMap((section) => section.fields);
    const columns = fields.find(
      (field) => field.key === "qualifications",
    )!.fields;

    expect(columns.map((column) => [column.key, column.type])).toEqual([
      ["qualification", "text"],
      ["institution", "text"],
      ["year", "number"],
      ["remarks", "text"],
    ]);
  });

  it("asks for a document exactly when the answers call for it", () => {
    const fields = form.sections.flatMap((section) => section.fields);
    const proof = fields.find((field) => field.key === "phd_guided_proof")!;

    // "Conditional (if items 11/12 > 0)" on the paper form.
    expect(proof.required).toBe(false);
    expect(proof.requiredWhen?.mode).toBe("any");
    expect(
      proof.requiredWhen?.rules.map((rule) => [rule.field, rule.operator]),
    ).toEqual([
      ["phd_guided", "greaterThan"],
      ["phd_co_guided", "greaterThan"],
    ]);

    // Nothing conditional is asked for before its condition holds.
    expect(isFieldVisible(proof, { phd_guided: 0, phd_co_guided: 0 })).toBe(
      false,
    );
    expect(isFieldVisible(proof, { phd_guided: 2, phd_co_guided: 0 })).toBe(
      true,
    );
  });

  it("keeps every data key distinct", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });
});

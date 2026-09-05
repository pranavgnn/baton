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
 * The example process a fresh install runs.
 *
 * It is meant to be replaced, but it is the first thing anybody sees and the
 * only workflow the portal ships with, so it has to be valid, publishable and
 * a fair demonstration of what the engine can do.
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

describe("the example workflow", () => {
  it("is valid and can be published as it stands", () => {
    expect(hasBlockingIssues(validateGraph(build(), context))).toBe(false);
  });

  it("runs the steps in the order the process describes", () => {
    expect(next("node_submission")).toBe("node_stage_department_review");
    expect(next("node_stage_department_review", "Send for assessment")).toBe(
      "node_stage_assessment",
    );
    expect(next("node_stage_assessment", "Return to the head")).toBe(
      "node_stage_department_decision",
    );
    expect(next("node_stage_department_decision", "Approve")).toBe(
      "node_stage_compliance",
    );
    expect(next("node_stage_compliance", "Forward for approval")).toBe(
      "node_stage_approval",
    );
  });

  it("sends an application back to its author rather than onward", () => {
    // The one branch that does not go forward, and the reason a stage is
    // allowed to point at the submission step at all.
    expect(next("node_stage_department_review", "Return for changes")).toBe(
      "node_submission",
    );
  });

  it("closes the application everywhere the process says it closes", () => {
    expect(next("node_stage_department_review", "Decline")).toBe(
      "node_end_declined",
    );
    expect(next("node_stage_department_decision", "Decline")).toBe(
      "node_end_declined",
    );
    expect(next("node_stage_approval", "Approve")).toBe("node_end_approved");
    expect(next("node_stage_approval", "Reject")).toBe("node_end_rejected");
  });

  it("gives the middle of the process no way to close the file", () => {
    // The assessment and the compliance check record a verdict that travels
    // with the application; only the head and the approver end it.
    for (const id of ["node_stage_assessment", "node_stage_compliance"]) {
      expect(stage(id).data.outcomes).toHaveLength(1);
    }
  });

  it("asks the head for nothing while they are only routing it", () => {
    expect(
      stage("node_stage_department_review").data.form.sections,
    ).toHaveLength(0);
    // Their remarks are written once, at the decision.
    expect(
      stage("node_stage_department_decision").data.form.sections[0].fields.map(
        (field) => field.key,
      ),
    ).toEqual(["remarks"]);
  });

  it("holds the assessment for one named person and the rest for a role", () => {
    expect(stage("node_stage_assessment").data.assignment).toEqual({
      mode: "nominated",
      pool: "department_deputies",
      scope: "all_holders",
    });

    for (const id of [
      "node_stage_department_review",
      "node_stage_department_decision",
      "node_stage_compliance",
      "node_stage_approval",
    ]) {
      expect(stage(id).data.assignment.mode).toBe("role");
    }
  });

  it("keeps a head inside their own department, and leaves the rest open", () => {
    for (const id of [
      "node_stage_department_review",
      "node_stage_department_decision",
    ]) {
      expect(stage(id).data.assignment.scope).toBe("applicant_department");
    }
    for (const id of ["node_stage_compliance", "node_stage_approval"]) {
      expect(stage(id).data.assignment.scope).toBe("all_holders");
    }
  });

  it("assigns each step to the role that owns it", () => {
    expect(stage("node_stage_department_review").data.roleId).toBe(
      roleIdByName["Department Head"],
    );
    // The head sees it twice: once to route it, once to decide it.
    expect(stage("node_stage_department_decision").data.roleId).toBe(
      roleIdByName["Department Head"],
    );
    expect(stage("node_stage_assessment").data.roleId).toBe(
      roleIdByName["Deputy Head"],
    );
    expect(stage("node_stage_compliance").data.roleId).toBe(
      roleIdByName["Compliance Officer"],
    );
    expect(stage("node_stage_approval").data.roleId).toBe(
      roleIdByName["Approver"],
    );
  });

  it("addresses each notification to the people it concerns", () => {
    const graph = build();
    const email = (id: string) => {
      const node = nodeById(graph, id);
      if (!node || node.kind !== "email") throw new Error(`${id} is not email`);
      return node.data;
    };

    // Telling "the head" means the head of this applicant's department, and
    // telling "the deputy" means the one just handed the file.
    expect(email("node_email_head_assigned").recipientScope).toBe(
      "applicant_department",
    );
    expect(email("node_email_head_decision").recipientScope).toBe(
      "applicant_department",
    );
    expect(email("node_email_deputy_assigned").recipientScope).toBe(
      "assigned_person",
    );
    expect(email("node_email_compliance_assigned").recipientScope).toBe(
      "all_holders",
    );
  });

  it("notifies the applicant and the receiving side at every hand-off", () => {
    const emails = build().nodes.filter((node) => node.kind === "email");

    expect(emails.length).toBeGreaterThanOrEqual(9);
    for (const email of emails) {
      expect(email.kind === "email" && email.data.templateId).toBeTruthy();
    }
  });

  it("sends the approved application to Records for filing", () => {
    const filing = nodeById(build(), "node_email_filing");
    expect(filing?.kind).toBe("email");
    expect(filing?.kind === "email" && filing.data.recipientRoleId).toBe(
      roleIdByName["Records"],
    );
  });
});

describe("the example application form", () => {
  const form = defaultApplicantForm();
  const fields = form.sections.flatMap((section) => section.fields);
  const field = (key: string) => fields.find((entry) => entry.key === key)!;

  it("asks what the request is before anything else", () => {
    expect(form.sections[0].fields[0].key).toBe("request_type");
    expect(field("request_type").options.map((option) => option.value)).toEqual(
      ["promotion", "transfer", "training", "equipment", "other"],
    );
  });

  it("takes from the account what the account already holds", () => {
    expect(field("full_name").prefill).toBe("name");
    expect(field("department_name").prefill).toBe("department");
    expect(field("joined_on").prefill).toBe("dateOfJoining");
  });

  it("works the total out instead of asking for it", () => {
    expect(field("cost_total").formula).toBe("cost_direct + cost_indirect");
    expect(field("cost_direct").formula).toBe(null);
  });

  it("asks a question only when the answers call for it", () => {
    const detail = field("other_type_detail");
    expect(isFieldVisible(detail, { request_type: "promotion" })).toBe(false);
    expect(isFieldVisible(detail, { request_type: "other" })).toBe(true);

    // Required rather than hidden: the funding source is always shown and is
    // only demanded once the box above it is ticked.
    const source = field("funding_source");
    expect(source.required).toBe(false);
    expect(source.requiredWhen?.rules.map((entry) => entry.field)).toEqual([
      "needs_funding",
    ]);
  });

  it("asks for a table as a repeating group with typed columns", () => {
    const group = field("earlier_requests");
    expect(group.type).toBe("repeater");
    expect(group.fields.map((column) => [column.key, column.type])).toEqual([
      ["reference", "text"],
      ["year", "number"],
      ["outcome", "select"],
      ["remarks", "text"],
    ]);
  });

  it("demonstrates one of everything the engine can render", () => {
    const kinds = new Set(fields.map((entry) => entry.type));
    for (const kind of [
      "text",
      "textarea",
      "select",
      "date",
      "phone",
      "number",
      "checkbox",
      "file",
      "repeater",
      "paragraph",
    ]) {
      expect(kinds).toContain(kind);
    }
  });

  it("keeps every data key distinct", () => {
    const keys = fields.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

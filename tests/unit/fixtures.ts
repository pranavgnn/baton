import {
  createField,
  createOutcome,
  createSection,
} from "@/lib/workflow/defaults";
import type {
  FormSchema,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "@/lib/workflow/types";

export const ROLE_HOD = "role-hod";
export const ROLE_DEAN = "role-dean";
export const TEMPLATE_ACK = "template-ack";

export function simpleForm(): FormSchema {
  return {
    sections: [
      createSection("Details", [
        createField({
          type: "text",
          key: "full_name",
          label: "Full name",
          required: true,
        }),
      ]),
    ],
  };
}

type BuildOptions = {
  /** Outcome ids are returned so tests can drive specific branches. */
  onGraph?: (graph: WorkflowGraph) => void;
};

/**
 * Start -> Email -> HOD stage, branching to an approved end, a rejected end and
 * a loop back to the start node. Mirrors the shipped default workflow closely
 * enough to exercise every routing rule.
 */
export function buildGraph(options: BuildOptions = {}) {
  const approve = createOutcome("Approve", "positive");
  const reject = createOutcome("Reject", "negative");
  const sendBack = createOutcome("Send back", "neutral");

  const nodes: WorkflowNode[] = [
    {
      id: "start",
      kind: "start",
      position: { x: 0, y: 0 },
      data: {
        label: "Applicant Submission",
        description: "",
        form: simpleForm(),
      },
    },
    {
      id: "email_ack",
      kind: "email",
      position: { x: 100, y: 0 },
      data: {
        label: "Acknowledge",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "applicant",
        recipientRoleId: null,
        recipientEmail: "",
      },
    },
    {
      id: "stage_hod",
      kind: "stage",
      position: { x: 200, y: 0 },
      data: {
        label: "HOD Review",
        description: "",
        roleId: ROLE_HOD,
        form: simpleForm(),
        outcomes: [approve, reject, sendBack],
      },
    },
    {
      id: "email_back",
      kind: "email",
      position: { x: 200, y: 100 },
      data: {
        label: "Notify Applicant",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "applicant",
        recipientRoleId: null,
        recipientEmail: "",
      },
    },
    {
      id: "email_approved",
      kind: "email",
      position: { x: 300, y: -50 },
      data: {
        label: "Approval Letter",
        description: "",
        templateId: TEMPLATE_ACK,
        recipientMode: "role",
        recipientRoleId: ROLE_DEAN,
        recipientEmail: "",
      },
    },
    {
      id: "end_approved",
      kind: "end",
      position: { x: 400, y: -50 },
      data: { label: "Approved", description: "", result: "approved" },
    },
    {
      id: "end_rejected",
      kind: "end",
      position: { x: 400, y: 50 },
      data: { label: "Rejected", description: "", result: "rejected" },
    },
  ];

  const edges: WorkflowEdge[] = [
    // Submission continues to the stage; the acknowledgement rides alongside.
    { id: "e1", source: "start", sourceHandle: "out", target: "stage_hod" },
    { id: "e2", source: "start", sourceHandle: "out", target: "email_ack" },

    // Approve: straight to the approved ending, with a letter in parallel.
    {
      id: "e3",
      source: "stage_hod",
      sourceHandle: approve.id,
      target: "end_approved",
    },
    {
      id: "e3m",
      source: "stage_hod",
      sourceHandle: approve.id,
      target: "email_approved",
    },

    // Reject: no email at all, to prove a bare continuation is valid.
    {
      id: "e4",
      source: "stage_hod",
      sourceHandle: reject.id,
      target: "end_rejected",
    },

    // Send back: returns to the applicant, who is told why.
    {
      id: "e5",
      source: "stage_hod",
      sourceHandle: sendBack.id,
      target: "start",
    },
    {
      id: "e5m",
      source: "stage_hod",
      sourceHandle: sendBack.id,
      target: "email_back",
    },
  ];

  const graph: WorkflowGraph = { nodes, edges };
  options.onGraph?.(graph);

  return {
    graph,
    outcomes: { approve, reject, sendBack },
    context: { roleIds: [ROLE_HOD, ROLE_DEAN], templateIds: [TEMPLATE_ACK] },
  };
}

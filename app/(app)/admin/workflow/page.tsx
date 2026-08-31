import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { getWorkflow, listRoles } from "@/lib/applications/service";
import { db } from "@/lib/db";
import { emailTemplate } from "@/lib/db/schema";
import { defaultApplicantForm, newId } from "@/lib/workflow/defaults";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { WorkflowBuilder } from "./workflow-builder";

export const metadata: Metadata = { title: "Workflow builder" };

/** A brand new install still gets a canvas with the mandatory entry node. */
function blankGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: newId("node_start"),
        kind: "start",
        position: { x: 0, y: 0 },
        data: {
          label: "Applicant Submission",
          description: "",
          form: defaultApplicantForm(),
        },
      },
    ],
    edges: [],
  };
}

export default async function WorkflowPage() {
  await requirePermission("workflow.manage");

  const [flow, roles, templates] = await Promise.all([
    getWorkflow(),
    listRoles(),
    db.select().from(emailTemplate).orderBy(emailTemplate.name),
  ]);

  return (
    <WorkflowBuilder
      initialGraph={flow?.graph ?? blankGraph()}
      initialName={flow?.name ?? "Faculty Promotion"}
      initialDescription={flow?.description ?? ""}
      publishedGraph={flow?.publishedGraph ?? null}
      version={flow?.version ?? 0}
      acceptingApplications={flow?.acceptingApplications ?? false}
      roles={roles.map((role) => ({ id: role.id, name: role.name }))}
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
      }))}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationTimeline } from "@/components/application-timeline";
import { FormPreview } from "@/components/form-runtime/form-preview";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  canActOnCurrentStage,
  getApplicationById,
  getStageDraft,
  getTimeline,
} from "@/lib/applications/service";
import { forbidden, requirePermission } from "@/lib/auth/session";
import { accountProfile } from "@/lib/users/account-profile";
import { nodeById, stageNodes, startNode } from "@/lib/workflow/graph";
import { APPLICANT_NAMESPACE } from "@/lib/workflow/types";
import { nomineesByOutcome } from "../actions";
import { ReviewForm } from "./review-form";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review application" };

export default async function ReviewPage({
  params,
}: PageProps<"/reviews/[applicationId]">) {
  const current = await requirePermission("applications.review");
  const { applicationId } = await params;

  const app = await getApplicationById(applicationId);
  if (!app) notFound();

  const stage = nodeById(app.graph, app.currentNodeId);
  const actionable = canActOnCurrentStage(app, current);

  // Resolved per outcome: only the branches that lead to a stage held for one
  // person ask for a name, so the director is asked when forwarding and not
  // when deciding it themselves.
  const nominees =
    actionable && stage?.kind === "stage"
      ? await nomineesByOutcome(app, stage)
      : {};

  // Reviewers who already signed off keep read access; everyone else is out.
  const previouslyActed = stageNodes(app.graph).some(
    (node) =>
      node.data.roleId !== null &&
      current.roleIds.includes(node.data.roleId) &&
      Boolean(app.data?.[node.id]),
  );
  if (!actionable && !previouslyActed && !current.isSuperAdmin) forbidden();

  const start = startNode(app.graph);
  const [timeline, draft, profile] = await Promise.all([
    getTimeline(app.id),
    actionable && stage
      ? getStageDraft(app.id, stage.id, current.id)
      : Promise.resolve(undefined),
    accountProfile(current.id),
  ]);

  const earlierReviews = stageNodes(app.graph)
    .filter((node) => app.data?.[node.id])
    .filter((node) => node.id !== stage?.id);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{app.reference}</h1>
          <p className="page-subtitle">
            {app.applicant.name} · {app.applicant.email}
            {app.applicant.department ? ` · ${app.applicant.department}` : ""}
          </p>
        </div>
        <div className="toolbar">
          <ExportPdfButton applicationId={app.id} />
          <StatusBadge status={app.status} />
        </div>
      </div>

      {!actionable ? (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            {/* A finished application rests on an End node, which is an
                outcome rather than somewhere it is waiting. */}
            {stage?.kind === "stage"
              ? `This application is with "${stage.data.label}" and is not waiting on your role.`
              : `This application is closed${
                  stage ? ` as ${stage.data.label.toLowerCase()}` : ""
                }.`}
          </AlertDescription>
        </Alert>
      ) : null}

      <ReviewWorkspace
        decisionLabel={
          stage?.kind === "stage" ? stage.data.label : "This decision"
        }
        application={
          <>
            <section className="section-stack">
              <h2 className="section-heading">What the applicant submitted</h2>
              {start ? (
                <FormPreview
                  form={start.data.form}
                  data={app.data?.[APPLICANT_NAMESPACE] ?? null}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The submission form is not available.
                </p>
              )}
            </section>

            {/* Everyone before this reviewer, in the order they signed off, so
                the file reads as one document rather than as a set of tabs. */}
            {earlierReviews.map((node) => (
              <section key={node.id} className="section-stack">
                <h2 className="section-heading">{node.data.label}</h2>
                <FormPreview form={node.data.form} data={app.data[node.id]} />
              </section>
            ))}
          </>
        }
        decision={
          actionable && stage?.kind === "stage" ? (
            <ReviewForm
              applicationId={app.id}
              stageLabel={stage.data.label}
              form={stage.data.form}
              outcomes={stage.data.outcomes}
              defaultValues={draft?.data ?? app.data?.[stage.id] ?? null}
              nomineesByOutcome={nominees}
              profile={profile}
            />
          ) : null
        }
        history={<ApplicationTimeline events={timeline} />}
      />
    </div>
  );
}

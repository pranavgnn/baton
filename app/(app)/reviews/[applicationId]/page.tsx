import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationTimeline } from "@/components/application-timeline";
import { FormPreview } from "@/components/form-runtime/form-preview";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canActOnCurrentStage,
  getApplicationById,
  getStageDraft,
  getTimeline,
} from "@/lib/applications/service";
import { forbidden, requirePermission } from "@/lib/auth/session";
import { nodeById, stageNodes, startNode } from "@/lib/workflow/graph";
import { APPLICANT_NAMESPACE } from "@/lib/workflow/types";
import { nomineesFor } from "../actions";
import { ReviewForm } from "./review-form";

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

  // Reviewers who already signed off keep read access; everyone else is out.
  const nominees =
    actionable && stage?.kind === "stage" && stage.data.nominatesNext
      ? await nomineesFor(app, stage)
      : null;

  const previouslyActed = stageNodes(app.graph).some(
    (node) =>
      node.data.roleId !== null &&
      current.roleIds.includes(node.data.roleId) &&
      Boolean(app.data?.[node.id]),
  );
  if (!actionable && !previouslyActed && !current.isSuperAdmin) forbidden();

  const start = startNode(app.graph);
  const [timeline, draft] = await Promise.all([
    getTimeline(app.id),
    actionable && stage
      ? getStageDraft(app.id, stage.id, current.id)
      : Promise.resolve(undefined),
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
            {app.applicant.school ? ` · ${app.applicant.school}` : ""}
          </p>
        </div>
        <StatusBadge status={app.status} />
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

      <Tabs defaultValue={actionable ? "review" : "application"}>
        <TabsList>
          {actionable ? (
            <TabsTrigger value="review">Your review</TabsTrigger>
          ) : null}
          <TabsTrigger value="application">Applicant submission</TabsTrigger>
          {earlierReviews.length > 0 ? (
            <TabsTrigger value="earlier">Earlier reviews</TabsTrigger>
          ) : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {actionable && stage?.kind === "stage" ? (
          <TabsContent value="review" className="pt-4">
            <ReviewForm
              applicationId={app.id}
              stageLabel={stage.data.label}
              form={stage.data.form}
              outcomes={stage.data.outcomes}
              defaultValues={draft?.data ?? app.data?.[stage.id] ?? null}
              nominees={nominees}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="application" className="pt-4">
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
        </TabsContent>

        {earlierReviews.length > 0 ? (
          <TabsContent value="earlier" className="section-stack pt-4">
            {earlierReviews.map((node) => (
              <Card key={node.id}>
                <CardHeader>
                  <CardTitle className="text-base">{node.data.label}</CardTitle>
                  <CardDescription>
                    Recorded by the reviewer who completed this stage.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormPreview form={node.data.form} data={app.data[node.id]} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ) : null}

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              <ApplicationTimeline events={timeline} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

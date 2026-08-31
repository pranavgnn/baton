import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationTimeline } from "@/components/application-timeline";
import { FormPreview } from "@/components/form-runtime/form-preview";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canViewApplication,
  getApplicationById,
  getTimeline,
} from "@/lib/applications/service";
import { forbidden, requireUser } from "@/lib/auth/session";
import { nodeById, stageNodes, startNode } from "@/lib/workflow/graph";
import { APPLICANT_NAMESPACE } from "@/lib/workflow/types";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationDetailPage({
  params,
}: PageProps<"/applications/[applicationId]">) {
  const current = await requireUser();
  const { applicationId } = await params;

  const app = await getApplicationById(applicationId);
  if (!app) notFound();
  if (!canViewApplication(app, current)) forbidden();

  const [timeline] = await Promise.all([getTimeline(app.id)]);
  const start = startNode(app.graph);
  const stage = nodeById(app.graph, app.currentNodeId);
  const reviews = stageNodes(app.graph).filter((node) => app.data?.[node.id]);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{app.reference}</h1>
          <p className="page-subtitle">
            {app.applicant.name} · {app.applicant.email}
            {/* A finished application rests on an End node, so "currently at"
                would read as a stage it is waiting on. */}
            {stage?.kind === "stage"
              ? ` · Currently with ${stage.data.label}`
              : ""}
          </p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <Tabs defaultValue="application">
        <TabsList>
          <TabsTrigger value="application">Submission</TabsTrigger>
          {reviews.length > 0 ? (
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          ) : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

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

        {reviews.length > 0 ? (
          <TabsContent value="reviews" className="section-stack pt-4">
            {reviews.map((node) => (
              <Card key={node.id}>
                <CardHeader>
                  <CardTitle className="text-base">{node.data.label}</CardTitle>
                  <CardDescription>
                    {node.data.description || "Reviewer assessment."}
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

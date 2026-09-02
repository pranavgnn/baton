import { FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { ApplicationProgress } from "@/components/application-progress";
import { ApplicationTimeline } from "@/components/application-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getOpenApplicationFor,
  getPublishedWorkflow,
  getTimeline,
  listApplicationsFor,
  listRoles,
  refreshDraftToPublished,
} from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { accountProfile } from "@/lib/users/account-profile";
import { nodeById, startNode } from "@/lib/workflow/graph";
import {
  buildProgressGraph,
  type TravelledStep,
} from "@/lib/workflow/progress";
import {
  APPLICANT_NAMESPACE,
  DEFAULT_SOURCE_HANDLE,
} from "@/lib/workflow/types";
import { ApplicationWizard } from "./application-wizard";
import { StartApplicationButton } from "./start-application-button";

export const metadata: Metadata = { title: "My application" };

export default async function ApplicationPage() {
  const current = await requirePermission("applications.apply");

  const [published, existing, history, profile] = await Promise.all([
    getPublishedWorkflow(),
    getOpenApplicationFor(current.id),
    listApplicationsFor(current.id),
    accountProfile(current.id),
  ]);

  // A draft has not entered the workflow yet, so it should be filled in
  // against the questions currently published rather than the ones that were
  // live when it was started.
  const open = existing ? await refreshDraftToPublished(existing) : null;

  if (!published) {
    return (
      <div className="app-shell">
        <Alert>
          <Lock className="size-4" />
          <AlertTitle>Applications are not available yet</AlertTitle>
          <AlertDescription>
            The promotion workflow has not been published. Please check back
            later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  /* No application yet ---------------------------------------------------- */
  if (!open) {
    const completed = history.filter((app) => app.status !== "draft");

    return (
      <div className="app-shell section-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Promotion application</h1>
            <p className="page-subtitle">
              {published.acceptingApplications
                ? "Applications are open."
                : "Applications are currently closed."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Start your promotion application
            </CardTitle>
            <CardDescription>
              You can save your progress at any point and finish later. Nothing
              is sent until you submit from the preview page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StartApplicationButton
              disabled={!published.acceptingApplications}
            />
          </CardContent>
        </Card>

        {completed.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Previous applications</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {completed.map((app) => (
                  <li
                    key={app.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <span className="font-mono text-sm">{app.reference}</span>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={app.status} />
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/applications/${app.id}`}>View</Link>
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  /* Draft: show the wizard ------------------------------------------------ */
  const start = startNode(open.graph);
  const timeline = await getTimeline(open.id);

  if (open.status === "draft" && start) {
    const returned = timeline.some((event) => event.type === "reopened");

    return (
      <div className="app-shell section-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">{start.data.label}</h1>
            <p className="page-subtitle">{open.reference}</p>
          </div>
          <StatusBadge status={open.status} />
        </div>

        {returned ? (
          <Alert>
            <AlertTitle>This application was sent back to you</AlertTitle>
            <AlertDescription>
              A reviewer asked for changes. Update your answers and submit again
              - the timeline below shows what happened.
            </AlertDescription>
          </Alert>
        ) : null}

        <ApplicationWizard
          form={start.data.form}
          defaultValues={open.data?.[APPLICANT_NAMESPACE] ?? null}
          profile={profile}
        />

        {timeline.length > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ApplicationTimeline events={timeline} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  /* Submitted: show where it is in the process ---------------------------- */
  const currentNode = nodeById(open.graph, open.currentNodeId);
  const roles = await listRoles();
  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));

  /**
   * The route the application has actually taken, oldest first. Only the
   * events that moved it count - email is a notification, not a step.
   */
  const travelled: TravelledStep[] = timeline
    .filter(
      (event) => event.type === "submitted" || event.type === "stage_completed",
    )
    .map((event) => ({
      nodeId: event.nodeId ?? "",
      handleId: event.outcomeId ?? DEFAULT_SOURCE_HANDLE,
      at: event.createdAt.toISOString(),
    }))
    .filter((step) => step.nodeId.length > 0);

  const progress = buildProgressGraph({
    graph: open.graph,
    travelled,
    currentNodeId: open.currentNodeId,
    roleName: (roleId) => (roleId ? (roleNameById.get(roleId) ?? null) : null),
    startedAt: open.createdAt.toISOString(),
  });

  const positions: Record<string, { x: number; y: number }> = {};
  const kinds: Record<string, "start" | "stage" | "end"> = {};
  const results: Record<string, "approved" | "rejected" | "withdrawn" | null> =
    {};
  for (const node of open.graph.nodes) {
    if (node.kind === "email") continue;
    positions[node.id] = node.position;
    kinds[node.id] = node.kind;
    results[node.id] = node.kind === "end" ? node.data.result : null;
  }

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{open.reference}</h1>
          <p className="page-subtitle">
            {currentNode?.kind === "stage"
              ? `Currently with ${
                  roleNameById.get(currentNode.data.roleId ?? "") ??
                  currentNode.data.label
                }`
              : currentNode
                ? currentNode.data.label
                : "In progress"}
          </p>
        </div>
        <StatusBadge status={open.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where your application is</CardTitle>
          <CardDescription>
            Every step it can pass through. The route it has taken is
            highlighted, and the ring marks where it sits now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationProgress
            progress={progress}
            positions={positions}
            kinds={kinds}
            results={results}
          />
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="self-start">
        <Link href={`/applications/${open.id}`}>View my submitted answers</Link>
      </Button>
    </div>
  );
}

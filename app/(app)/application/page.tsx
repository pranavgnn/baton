import { FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
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
} from "@/lib/applications/service";
import { requirePermission } from "@/lib/auth/session";
import { nodeById, startNode } from "@/lib/workflow/graph";
import { APPLICANT_NAMESPACE } from "@/lib/workflow/types";
import { ApplicationWizard } from "./application-wizard";
import { StartApplicationButton } from "./start-application-button";

export const metadata: Metadata = { title: "My application" };

export default async function ApplicationPage() {
  const current = await requirePermission("applications.apply");

  const [published, open, history] = await Promise.all([
    getPublishedWorkflow(),
    getOpenApplicationFor(current.id),
    listApplicationsFor(current.id),
  ]);

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
            <h1 className="page-title">{published.name}</h1>
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
            <p className="page-subtitle">
              {open.reference} · {published.name}
            </p>
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

  /* Submitted: show progress --------------------------------------------- */
  const currentNode = nodeById(open.graph, open.currentNodeId);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">{open.reference}</h1>
          <p className="page-subtitle">
            {currentNode
              ? `Currently with: ${currentNode.data.label}`
              : "In progress"}
          </p>
        </div>
        <StatusBadge status={open.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            You will be emailed each time your application moves forward.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationTimeline events={timeline} />
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="self-start">
        <Link href={`/applications/${open.id}`}>View my submitted answers</Link>
      </Button>
    </div>
  );
}

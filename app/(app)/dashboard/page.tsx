import {
  ArrowRight,
  ClipboardList,
  FileText,
  Settings,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, canAny, requireUser } from "@/lib/auth/session";
import {
  countApplicationsByStatus,
  getOpenApplicationFor,
  getPublishedWorkflow,
  getReviewQueue,
  listApplicationsFor,
} from "@/lib/applications/service";
import { nodeById } from "@/lib/workflow/graph";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const current = await requireUser();

  const isApplicant = can(current, "applications.apply");
  const isReviewer = can(current, "applications.review");
  const isOverseer = can(current, "applications.viewAll");
  const isAdmin = canAny(current, [
    "admin.access",
    "users.manage",
    "roles.manage",
    "workflow.manage",
    "templates.manage",
  ]);

  const [published, openApplication, myApplications, queue, counts] =
    await Promise.all([
      getPublishedWorkflow(),
      isApplicant ? getOpenApplicationFor(current.id) : Promise.resolve(null),
      isApplicant ? listApplicationsFor(current.id) : Promise.resolve([]),
      isReviewer ? getReviewQueue(current) : Promise.resolve([]),
      isOverseer || isAdmin
        ? countApplicationsByStatus()
        : Promise.resolve(null),
    ]);

  const currentStageLabel = openApplication
    ? (nodeById(openApplication.graph, openApplication.currentNodeId)?.data
        .label ?? null)
    : null;

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {current.name}</h1>
          <p className="page-subtitle">
            {published ? published.name : "No workflow has been published yet."}
          </p>
        </div>
      </div>

      {counts ? (
        <div className="stat-grid">
          <StatCard label="In progress" value={counts.in_progress} />
          <StatCard label="Approved" value={counts.approved} />
          <StatCard label="Rejected" value={counts.rejected} />
          <StatCard label="Drafts" value={counts.draft} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {isApplicant ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                My application
              </CardTitle>
              <CardDescription>
                {openApplication
                  ? currentStageLabel
                    ? `Currently at: ${currentStageLabel}`
                    : "Draft in progress"
                  : "You have not started an application yet."}
              </CardDescription>
              {openApplication ? (
                <CardAction>
                  <StatusBadge status={openApplication.status} />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent>
              {myApplications.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {myApplications.slice(0, 4).map((app) => (
                    <li
                      key={app.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm"
                    >
                      <span className="font-mono text-xs">{app.reference}</span>
                      <StatusBadge status={app.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {published?.acceptingApplications
                    ? "Applications are open. Start yours whenever you are ready."
                    : "Applications are not currently open."}
                </p>
              )}
            </CardContent>
            <CardFooter>
              {/* asChild forwards to a Link, which ignores `disabled`. */}
              <Button asChild={Boolean(published)} disabled={!published}>
                <Link href="/application">
                  {openApplication
                    ? openApplication.status === "draft"
                      ? "Continue application"
                      : "Track application"
                    : "Start application"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {isReviewer ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                Awaiting your review
              </CardTitle>
              <CardDescription>
                {queue.length === 0
                  ? "Nothing is waiting on you right now."
                  : `${queue.length} application${queue.length === 1 ? "" : "s"} assigned to your role.`}
              </CardDescription>
              <CardAction>
                <span className="stat-value">{queue.length}</span>
              </CardAction>
            </CardHeader>
            <CardContent>
              {queue.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {queue.slice(0, 4).map((app) => (
                    <li
                      key={app.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {app.applicant.name}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {app.reference}
                        </span>
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/reviews/${app.id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Applications appear here the moment they reach a stage your
                  role is responsible for.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline">
                <Link href="/reviews">
                  Open review queue
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-4" />
                Administration
              </CardTitle>
              <CardDescription>
                Configure the workflow, forms, templates and access.
              </CardDescription>
            </CardHeader>
            <CardContent className="toolbar">
              {can(current, "workflow.manage") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/workflow">Workflow builder</Link>
                </Button>
              ) : null}
              {can(current, "templates.manage") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/templates">Email templates</Link>
                </Button>
              ) : null}
              {can(current, "users.manage") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/users">
                    <Users className="size-4" />
                    Users
                  </Link>
                </Button>
              ) : null}
              {can(current, "roles.manage") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/roles">Roles</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="stat-value">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

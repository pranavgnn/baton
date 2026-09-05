import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  History,
  KeyRound,
  Mail,
  Settings,
  Users,
  Workflow,
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, canAny, requireUser } from "@/lib/auth/session";
import { applicationBar } from "@/lib/users/profile";
import {
  countApplicationsByStatus,
  getOpenApplicationFor,
  getPublishedWorkflow,
  getReviewQueue,
  listApplicationsFor,
  listReviewsBy,
  type CompletedReview,
} from "@/lib/applications/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { nodeById } from "@/lib/workflow/graph";
import type { Application } from "@/lib/db/schema";

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
    "forms.manage",
    "templates.manage",
  ]);

  const [published, openApplication, myApplications, queue, reviewed, counts] =
    await Promise.all([
      getPublishedWorkflow(),
      isApplicant ? getOpenApplicationFor(current.id) : Promise.resolve(null),
      isApplicant ? listApplicationsFor(current.id) : Promise.resolve([]),
      isReviewer ? getReviewQueue(current) : Promise.resolve([]),
      isReviewer ? listReviewsBy(current.id) : Promise.resolve([]),
      isOverseer || isAdmin
        ? countApplicationsByStatus()
        : Promise.resolve(null),
    ]);

  const currentStageLabel = openApplication
    ? (nodeById(openApplication.graph, openApplication.currentNodeId)?.data
        .label ?? null)
    : null;

  const past = myApplications.filter((app) => app.id !== openApplication?.id);

  return (
    <div className="app-shell-wide section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {current.name}</h1>
          <p className="page-subtitle">
            {published
              ? "Applications are configured and running."
              : "No workflow has been published yet."}
          </p>
        </div>
        {current.roles.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Signed in as {current.roles.map((role) => role.name).join(", ")}
          </p>
        ) : null}
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <StatCard label="In progress" value={counts.in_progress} />
          <StatCard label="Approved" value={counts.approved} />
          <StatCard label="Rejected" value={counts.rejected} />
          <StatCard label="Drafts" value={counts.draft} />
        </div>
      ) : null}

      {isApplicant ? (
        <ApplicantPanel
          barred={applicationBar(current.userType)}
          application={openApplication}
          stageLabel={currentStageLabel}
          past={past}
          applicationsOpen={Boolean(published?.acceptingApplications)}
          workflowPublished={Boolean(published)}
        />
      ) : null}

      {isReviewer ? (
        <>
          <ReviewPanel queue={queue} />
          <ReviewedPanel reviewed={reviewed} />
        </>
      ) : null}

      {isAdmin ? <AdminPanel current={current} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Applicant                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The applicant's whole dashboard is this one panel, so it takes the full
 * width: where the application is, when each thing happened to it, and the one
 * action worth taking - laid out along the page rather than stacked in a
 * column with half the screen empty beside it.
 */
function ApplicantPanel({
  application,
  stageLabel,
  past,
  applicationsOpen,
  workflowPublished,
  barred,
}: {
  application: Application | null;
  stageLabel: string | null;
  past: Application[];
  applicationsOpen: boolean;
  workflowPublished: boolean;
  /** Why this person cannot apply at all, if they cannot. */
  barred: string | null;
}) {
  if (!application) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Your application</CardTitle>
            <CardDescription>
              {barred
                ? barred
                : applicationsOpen
                  ? "Applications are open. You can save your progress and finish later."
                  : "Applications are not currently open."}
            </CardDescription>
            <CardAction>
              {/* asChild forwards to a Link, which ignores `disabled`. */}
              <Button
                asChild={workflowPublished && !barred}
                disabled={!workflowPublished || Boolean(barred)}
                data-testid="dashboard-primary-action"
              >
                {barred ? (
                  <span>Not eligible</span>
                ) : (
                  <Link href="/application">
                    Start application
                    <ArrowRight className="size-4" />
                  </Link>
                )}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        <PastApplications applications={past} />
      </>
    );
  }

  const isDraft = application.status === "draft";
  const closed =
    application.status !== "draft" && Boolean(application.completedAt);

  return (
    <>
      <Card data-testid="my-application">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="font-mono">{application.reference}</span>
            <StatusBadge status={application.status} />
          </CardTitle>
          <CardDescription>
            {isDraft
              ? "Started but not yet submitted."
              : stageLabel
                ? `Currently at ${stageLabel}`
                : "In progress"}
          </CardDescription>
          <CardAction>
            <Button asChild data-testid="dashboard-primary-action">
              <Link href="/application">
                {isDraft ? "Continue application" : "Track application"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <dl className="fact-row">
            <Fact label="Started" value={formatDate(application.createdAt)} />
            <Fact
              label="Submitted"
              value={
                application.submittedAt
                  ? formatDateTime(application.submittedAt)
                  : "Not yet submitted"
              }
            />
            <Fact
              label={closed ? "Decided" : "Last activity"}
              value={formatDateTime(
                application.completedAt ?? application.updatedAt,
              )}
            />
            <Fact
              label={isDraft ? "Next step" : "Now with"}
              value={isDraft ? "Finish and submit" : (stageLabel ?? "—")}
            />
          </dl>
        </CardContent>
      </Card>

      <PastApplications applications={past} />
    </>
  );
}

function PastApplications({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Earlier applications
        </CardTitle>
        <CardDescription>
          Every application you have submitted, most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="record-list" data-testid="past-applications">
          {applications.map((app) => (
            <li key={app.id} className="record-row">
              <span className="font-mono text-sm">{app.reference}</span>
              <span className="text-sm text-muted-foreground">
                Submitted {formatDate(app.submittedAt)}
              </span>
              <span className="text-sm text-muted-foreground">
                {app.completedAt
                  ? `Decided ${formatDate(app.completedAt)}`
                  : "Still in progress"}
              </span>
              <StatusBadge status={app.status} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/applications/${app.id}`}>View</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Reviewer                                                                   */
/* -------------------------------------------------------------------------- */

function ReviewPanel({
  queue,
}: {
  queue: Awaited<ReturnType<typeof getReviewQueue>>;
}) {
  return (
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
          <Button asChild variant="outline">
            <Link href="/reviews">
              Open review queue
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Applications appear here the moment they reach a step your role is
            responsible for.
          </p>
        ) : (
          <ul className="record-list">
            {queue.slice(0, 6).map((app) => (
              <li key={app.id} className="record-row">
                <span className="text-sm font-medium">
                  {app.applicant.name}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {app.reference}
                </span>
                <span className="text-sm text-muted-foreground">
                  Submitted {formatDate(app.submittedAt)}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/reviews/${app.id}`}>Review</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The other half of a reviewer's dashboard: what they have already decided.
 * The queue answers "what is waiting"; this answers "what did I say", which a
 * queue can never answer because working through it is what empties it.
 */
function ReviewedPanel({ reviewed }: { reviewed: CompletedReview[] }) {
  if (reviewed.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" />
          Reviewed by you
        </CardTitle>
        <CardDescription>
          {reviewed.length} decision{reviewed.length === 1 ? "" : "s"} recorded,
          most recent first.
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline">
            <Link href="/reviews/history">
              See all your reviews
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="record-list" data-testid="reviewed-by-you">
          {reviewed.slice(0, 5).map((review) => (
            <li key={review.eventId} className="record-row">
              <span className="text-sm font-medium">
                {review.applicantName}
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                {review.reference}
              </span>
              <span className="text-sm text-muted-foreground">
                {review.stageLabel}
                {review.outcomeLabel ? `: ${review.outcomeLabel}` : ""}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDate(review.reviewedAt)}
              </span>
              <StatusBadge status={review.status} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/reviews/${review.applicationId}`}>View</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Administration                                                             */
/* -------------------------------------------------------------------------- */

function AdminPanel({
  current,
}: {
  current: Awaited<ReturnType<typeof requireUser>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="size-4" />
          Administration
        </CardTitle>
        <CardDescription>
          Set up the process, the people who run it and the messages it sends.
        </CardDescription>
      </CardHeader>
      <CardContent className="toolbar">
        {canAny(current, ["workflow.manage", "forms.manage"]) ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/workflow">
              <Workflow className="size-4" />
              Workflow builder
            </Link>
          </Button>
        ) : null}
        {can(current, "templates.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/templates">
              <Mail className="size-4" />
              Email templates
            </Link>
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
            <Link href="/admin/roles">
              <KeyRound className="size-4" />
              Roles
            </Link>
          </Button>
        ) : null}
        {can(current, "users.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/departments">
              <GraduationCap className="size-4" />
              Departments
            </Link>
          </Button>
        ) : null}
        {can(current, "audit.view") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/audit">
              <History className="size-4" />
              Audit log
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{value}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card/70 p-4 shadow-2xs backdrop-blur-xs transition-colors hover:bg-card sm:p-5">
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="stat-value text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </span>
    </div>
  );
}

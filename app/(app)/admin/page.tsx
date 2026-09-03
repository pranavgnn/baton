import { count } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Mail,
  Shield,
  Users,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, canAny, requireAnyPermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailTemplate, role, user } from "@/lib/db/schema";
import { getWorkflow, listRoles } from "@/lib/applications/service";
import { hasBlockingIssues, validateGraph } from "@/lib/workflow/graph";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const current = await requireAnyPermission([
    "admin.access",
    "users.manage",
    "roles.manage",
    "workflow.manage",
    "forms.manage",
    "templates.manage",
  ]);

  const [userCount, roleCount, templateCount, flow, roles, templates] =
    await Promise.all([
      db.select({ total: count() }).from(user),
      db.select({ total: count() }).from(role),
      db.select({ total: count() }).from(emailTemplate),
      getWorkflow(),
      listRoles(),
      db.select({ id: emailTemplate.id }).from(emailTemplate),
    ]);

  const issues = flow
    ? validateGraph(flow.graph, {
        roleIds: roles.map((r) => r.id),
        templateIds: templates.map((t) => t.id),
      })
    : [];
  const blocked = hasBlockingIssues(issues);
  const hasUnpublishedChanges =
    flow != null &&
    JSON.stringify(flow.graph) !== JSON.stringify(flow.publishedGraph);

  return (
    <div className="app-shell section-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">
            Set up the promotion process, the people who run it and the messages
            it sends.
          </p>
        </div>
      </div>

      {flow && !flow.publishedGraph ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>The workflow has never been published</AlertTitle>
          <AlertDescription>
            Applicants cannot start an application until a valid workflow is
            published.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasUnpublishedChanges ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Unpublished workflow changes</AlertTitle>
          <AlertDescription>
            The draft differs from the published version. In-flight applications
            keep running on the version they started with.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {canAny(current, ["workflow.manage", "forms.manage"]) ? (
          <Link
            href="/admin/workflow"
            className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/30"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Workflow className="size-5" />
                </div>
                {blocked ? (
                  <Badge variant="destructive">Needs attention</Badge>
                ) : (
                  <Badge variant="outline">
                    <CheckCircle2 className="size-3" />
                    Valid
                  </Badge>
                )}
              </div>
              <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                Workflow
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {flow
                  ? `${flow.graph.nodes.length} steps · version ${flow.version}`
                  : "Not configured"}
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-medium text-primary">
              Open builder
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : null}

        {can(current, "templates.manage") ? (
          <Link
            href="/admin/templates"
            className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/30"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="size-5" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                Email templates
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {templateCount[0]?.total ?? 0} templates configured
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-medium text-primary">
              Manage templates
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : null}

        {can(current, "users.manage") ? (
          <Link
            href="/admin/users"
            className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/30"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                Users
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {userCount[0]?.total ?? 0} whitelisted accounts
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-medium text-primary">
              Manage users
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : null}

        {can(current, "roles.manage") ? (
          <Link
            href="/admin/roles"
            className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/30"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="size-5" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                Roles
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {roleCount[0]?.total ?? 0} defined roles
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-medium text-primary">
              Manage roles
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : null}
      </div>

      {blocked && can(current, "workflow.manage") ? (
        <Card>
          <CardHeader>
            <CardTitle>Workflow problems</CardTitle>
            <CardDescription>
              These must be resolved before the draft can be published.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {issues
                .filter((issue) => issue.severity === "error")
                .map((issue, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {issue.message}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

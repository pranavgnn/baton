import { count } from "drizzle-orm";
import {
  AlertTriangle,
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
            Everything the promotion process needs is configured here - no code
            changes required for a policy update.
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="size-4" />
                Workflow
              </CardTitle>
              <CardDescription>
                {flow
                  ? `${flow.graph.nodes.length} nodes, version ${flow.version}`
                  : "Not configured"}
              </CardDescription>
              <CardAction>
                {blocked ? (
                  <Badge variant="destructive">Needs attention</Badge>
                ) : (
                  <Badge variant="outline">
                    <CheckCircle2 className="size-3" />
                    Valid
                  </Badge>
                )}
              </CardAction>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/workflow">Open builder</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {can(current, "templates.manage") ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-4" />
                Email templates
              </CardTitle>
              <CardDescription>
                {templateCount[0]?.total ?? 0} templates
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/templates">Manage templates</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {can(current, "users.manage") ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Users
              </CardTitle>
              <CardDescription>
                {userCount[0]?.total ?? 0} whitelisted accounts
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">Manage users</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {can(current, "roles.manage") ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-4" />
                Roles
              </CardTitle>
              <CardDescription>
                {roleCount[0]?.total ?? 0} roles
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/roles">Manage roles</Link>
              </Button>
            </CardFooter>
          </Card>
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

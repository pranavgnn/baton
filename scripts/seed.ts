/**
 * Idempotent bootstrap: creates the default roles, email templates, the
 * singleton workflow and the seeded Super Admin, then provisions the MinIO
 * bucket. Safe to run repeatedly.
 *
 *   pnpm seed
 */
import { eq } from "drizzle-orm";

import { provisionUser } from "@/lib/auth/provision";
import { db } from "@/lib/db";
import {
  emailTemplate,
  role,
  user,
  userRole,
  workflow,
  workflowVersion,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ensureBucket } from "@/lib/storage/s3";
import {
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_ROLES,
  defaultWorkflowGraph,
  SINGLETON_WORKFLOW_ID,
  SUPER_ADMIN_ROLE_NAME,
} from "@/lib/workflow/defaults";
import { validateGraph, hasBlockingIssues } from "@/lib/workflow/graph";
import type { RolePermission } from "@/lib/auth/permissions";

function log(step: string, detail = "") {
  console.log(`  ${step}${detail ? ` ${detail}` : ""}`);
}

async function seedRoles(): Promise<Record<string, string>> {
  console.log("\nRoles");
  const byName: Record<string, string> = {};

  for (const definition of DEFAULT_ROLES) {
    const existing = await db.query.role.findFirst({
      where: eq(role.name, definition.name),
    });

    if (existing) {
      byName[definition.name] = existing.id;
      log("· exists", definition.name);
      continue;
    }

    const id = crypto.randomUUID();
    await db.insert(role).values({
      id,
      name: definition.name,
      description: definition.description,
      permissions: definition.permissions as unknown as RolePermission[],
      isSystem: definition.isSystem,
    });
    byName[definition.name] = id;
    log("+ created", definition.name);
  }

  return byName;
}

async function seedTemplates(): Promise<Record<string, string>> {
  console.log("\nEmail templates");
  const byName: Record<string, string> = {};

  for (const definition of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await db.query.emailTemplate.findFirst({
      where: eq(emailTemplate.name, definition.name),
    });

    if (existing) {
      byName[definition.name] = existing.id;
      log("· exists", definition.name);
      continue;
    }

    const id = crypto.randomUUID();
    await db.insert(emailTemplate).values({
      id,
      name: definition.name,
      subject: definition.subject,
      bodyHtml: definition.bodyHtml,
      bodyJson: null,
      description: definition.description,
    });
    byName[definition.name] = id;
    log("+ created", definition.name);
  }

  return byName;
}

async function seedWorkflow(
  roleIdByName: Record<string, string>,
  templateIdByName: Record<string, string>,
) {
  console.log("\nWorkflow");
  const existing = await db.query.workflow.findFirst({
    where: eq(workflow.id, SINGLETON_WORKFLOW_ID),
  });

  if (existing) {
    log("· exists", `version ${existing.version}`);
    return;
  }

  const graph = defaultWorkflowGraph({ roleIdByName, templateIdByName });
  const issues = validateGraph(graph, {
    roleIds: Object.values(roleIdByName),
    templateIds: Object.values(templateIdByName),
  });

  if (hasBlockingIssues(issues)) {
    console.error("  ! default workflow failed validation:");
    for (const issue of issues) console.error(`    - ${issue.message}`);
    throw new Error("Refusing to seed an invalid workflow.");
  }

  const publishedAt = new Date();
  await db.insert(workflow).values({
    id: SINGLETON_WORKFLOW_ID,
    graph,
    publishedGraph: graph,
    version: 1,
    publishedAt,
    acceptingApplications: true,
  });

  await db.insert(workflowVersion).values({
    id: crypto.randomUUID(),
    workflowId: SINGLETON_WORKFLOW_ID,
    version: 1,
    graph,
    memo: "Initial pipeline: submission, departmental review, dean approval.",
    publishedByName: "Seed",
    createdAt: publishedAt,
  });
  log("+ created", "published version 1");
}

async function seedSuperAdmin(superAdminRoleId: string) {
  console.log("\nSuper admin");
  const provisioned = await provisionUser({
    email: env.SUPER_ADMIN_EMAIL,
    name: env.SUPER_ADMIN_NAME,
    password: env.SUPER_ADMIN_PASSWORD,
    activated: true,
  });
  const userId = provisioned.id;

  if (provisioned.created) {
    await db
      .update(user)
      .set({ activated: true, emailVerified: true })
      .where(eq(user.id, userId));
    log("+ created", env.SUPER_ADMIN_EMAIL);
  } else {
    log("· exists", env.SUPER_ADMIN_EMAIL);
  }

  const assignment = await db.query.userRole.findFirst({
    where: eq(userRole.userId, userId),
  });
  if (!assignment) {
    await db
      .insert(userRole)
      .values({ userId, roleId: superAdminRoleId })
      .onConflictDoNothing();
    log("+ assigned", SUPER_ADMIN_ROLE_NAME);
  }
}

async function seedBucket() {
  console.log("\nObject storage");
  try {
    await ensureBucket();
    log("· ready", env.S3_BUCKET);
  } catch (error) {
    console.warn(
      `  ! could not reach MinIO at ${env.S3_ENDPOINT}:`,
      error instanceof Error ? error.message : error,
    );
    console.warn("    File uploads will not work until it is running.");
  }
}

async function main() {
  console.log("Seeding MIT Promotion Application Portal");

  const roleIdByName = await seedRoles();
  const templateIdByName = await seedTemplates();
  await seedWorkflow(roleIdByName, templateIdByName);
  await seedSuperAdmin(roleIdByName[SUPER_ADMIN_ROLE_NAME]);
  await seedBucket();

  console.log("\nDone.");
  console.log(`  Sign in at ${env.NEXT_PUBLIC_APP_URL}/sign-in`);
  console.log(`  Email:    ${env.SUPER_ADMIN_EMAIL}`);
  console.log(`  Password: ${env.SUPER_ADMIN_PASSWORD}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  });

/**
 * Provisions demo accounts with known passwords for local development and the
 * end-to-end suite. Never run this against a real deployment.
 *
 *   pnpm seed:demo
 */
import { eq } from "drizzle-orm";

import { provisionUser } from "@/lib/auth/provision";
import { syncDesignatedRoles } from "@/lib/departments/sync";
import { syncAdminFlags } from "@/lib/auth/admin-flag";
import { db } from "@/lib/db";
import {
  role,
  department,
  departmentDeputy,
  user,
  userRole,
} from "@/lib/db/schema";
import { env } from "@/lib/env";

export const DEMO_PASSWORD = "Portal@123";

/** The department the demo accounts belong to. */
const DEMO_DEPARTMENT = "Engineering";

/**
 * One account per role, named for what it is.
 *
 * Deliberately not plausible people: an invented name in a demo database ends
 * up quoted in a screenshot or mistaken for a real member of staff.
 */
export const DEMO_USERS = [
  {
    email: "applicant@example.org",
    name: "Test Applicant",
    roleName: "Applicant",
    employeeId: "EMP-0001",
    department: DEMO_DEPARTMENT,
    designation: "Engineer",
    // Enough of a record for the example form to fill itself in, which is the
    // point of holding these on the account at all.
    userType: "regular",
    institution: "Example Organisation",
    dateOfBirth: "1990-02-11",
    dateOfJoining: "2019-06-01",
    phone: "+1 555 0100",
  },
  {
    email: "head@example.org",
    name: "Test Head",
    roleName: "Department Head",
    employeeId: "EMP-0002",
    department: DEMO_DEPARTMENT,
    designation: "Head of Engineering",
  },
  {
    email: "deputy@example.org",
    name: "Test Deputy",
    roleName: "Deputy Head",
    employeeId: "EMP-0003",
    department: DEMO_DEPARTMENT,
    designation: "Deputy Head of Engineering",
  },
  {
    email: "deputy2@example.org",
    name: "Test Deputy Two",
    roleName: "Deputy Head",
    employeeId: "EMP-0004",
    department: DEMO_DEPARTMENT,
    designation: "Deputy Head of Engineering",
  },
  {
    email: "compliance@example.org",
    name: "Test Compliance Officer",
    roleName: "Compliance Officer",
    employeeId: "EMP-0005",
    department: null,
    designation: "Compliance Officer",
  },
  {
    email: "approver@example.org",
    name: "Test Approver",
    roleName: "Approver",
    employeeId: "EMP-0006",
    department: null,
    designation: "Director of Operations",
  },
  {
    email: "records@example.org",
    name: "Test Records Officer",
    roleName: "Records",
    employeeId: "EMP-0007",
    department: null,
    designation: "Records Officer",
  },
] as const;

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production.");
  }

  console.log("Seeding demo accounts");

  const departments = await db.select().from(department);
  const departmentIdByName = new Map(
    departments.map((entry) => [entry.name, entry.id]),
  );

  for (const demo of DEMO_USERS) {
    const provisioned = await provisionUser({
      email: demo.email,
      name: demo.name,
      employeeId: demo.employeeId,
      departmentId: demo.department
        ? (departmentIdByName.get(demo.department) ?? null)
        : null,
      designation: demo.designation,
      userType: "userType" in demo ? demo.userType : null,
      institution: "institution" in demo ? demo.institution : null,
      dateOfBirth: "dateOfBirth" in demo ? demo.dateOfBirth : null,
      dateOfJoining: "dateOfJoining" in demo ? demo.dateOfJoining : null,
      phone: "phone" in demo ? demo.phone : null,
      password: DEMO_PASSWORD,
      activated: true,
    });

    // Existing accounts keep whatever password they already have; only the
    // freshly created ones get the shared demo password.
    await db
      .update(user)
      .set({ activated: true, emailVerified: true })
      .where(eq(user.id, provisioned.id));

    const target = await db.query.role.findFirst({
      where: eq(role.name, demo.roleName),
    });
    if (!target) {
      console.warn(
        `  ! role "${demo.roleName}" not found - run pnpm seed first`,
      );
      continue;
    }

    await db
      .insert(userRole)
      .values({ userId: provisioned.id, roleId: target.id })
      .onConflictDoNothing();

    console.log(
      `  ${provisioned.created ? "+ created" : "· exists"} ${demo.email} (${demo.roleName})`,
    );
  }

  await linkDepartmentSignatories();
  // The head and deputy roles follow the postings just made, exactly
  // as they do when an admin sets them from the departments page.
  await syncDesignatedRoles();
  await syncAdminFlags();

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}\n`);
}

/**
 * Gives the demo department its head and deputies.
 *
 * Without them the head has nobody to send an application to and the process
 * stops at the first step, so a demo database is not much of a demo.
 */
async function linkDepartmentSignatories() {
  const target = await db.query.department.findFirst({
    where: eq(department.name, DEMO_DEPARTMENT),
  });
  if (!target) {
    console.warn(
      `  ! department "${DEMO_DEPARTMENT}" not found - run pnpm seed first`,
    );
    return;
  }

  const byEmail = new Map(
    (await db.select().from(user)).map((row) => [row.email, row.id]),
  );

  const headId = byEmail.get("head@example.org");
  if (headId) {
    await db
      .update(department)
      .set({ headId })
      .where(eq(department.id, target.id));
  }

  const deputies = ["deputy@example.org", "deputy2@example.org"]
    .map((email) => byEmail.get(email))
    .filter((id): id is string => Boolean(id));

  await db
    .delete(departmentDeputy)
    .where(eq(departmentDeputy.departmentId, target.id));

  if (deputies.length > 0) {
    await db
      .insert(departmentDeputy)
      .values(deputies.map((userId) => ({ departmentId: target.id, userId })));
  }

  console.log(`  + ${DEMO_DEPARTMENT}: a head and ${deputies.length} deputies`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });

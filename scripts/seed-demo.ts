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
const DEMO_DEPARTMENT = "Department of Computer Engineering";

/**
 * One account per role, named for what it is.
 *
 * Deliberately not plausible people: an invented name in a demo database ends
 * up quoted in a screenshot or mistaken for a real member of staff.
 */
export const DEMO_USERS = [
  {
    email: "employee@manipal.edu",
    name: "Test Employee",
    roleName: "Employee",
    employeeId: "TEST-0001",
    department: "Department of Computer Engineering",
    designation: "Assistant Professor",
    // Enough of a service record for the application form to fill itself in,
    // which is the point of holding these on the account at all.
    userType: "regular",
    institution: "Manipal Institute of Technology",
    dateOfBirth: "1984-02-11",
    dateOfJoining: "2017-06-01",
    dateOfLastPromotion: "2021-07-01",
    phone: "+91 98450 00000",
  },
  {
    email: "head@manipal.edu",
    name: "Test Head",
    roleName: "Head",
    employeeId: "TEST-0002",
    department: "Department of Computer Engineering",
    designation: "Head",
  },
  {
    email: "associatehead@manipal.edu",
    name: "Test Deputy",
    roleName: "Deputy",
    employeeId: "TEST-0008",
    department: "Department of Computer Engineering",
    designation: "Deputy",
  },
  {
    email: "associatehead2@manipal.edu",
    name: "Test Deputy Two",
    roleName: "Deputy",
    employeeId: "TEST-0009",
    department: "Department of Computer Engineering",
    designation: "Deputy",
  },
  {
    email: "hr@manipal.edu",
    name: "Test HR Officer",
    roleName: "HR Officer",
    employeeId: "TEST-0003",
    department: null,
    designation: "HR Officer",
  },
  {
    email: "rc@manipal.edu",
    name: "Test R&C Officer",
    roleName: "R&C Officer",
    employeeId: "TEST-0004",
    department: null,
    designation: "Associate Director (R&C)",
  },
  {
    email: "fdw@manipal.edu",
    name: "Test FDW Officer",
    roleName: "FDW Officer",
    employeeId: "TEST-0005",
    department: null,
    designation: "Associate Director (FD&W)",
  },
  {
    email: "director@manipal.edu",
    name: "Test Director",
    roleName: "Director",
    employeeId: "TEST-0006",
    department: null,
    designation: "Director",
  },
  {
    email: "institutehr@manipal.edu",
    name: "Test Institute HR",
    roleName: "Institute HR",
    employeeId: "TEST-0007",
    department: null,
    designation: "Institute HR",
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
      dateOfLastPromotion:
        "dateOfLastPromotion" in demo ? demo.dateOfLastPromotion : null,
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

  const headId = byEmail.get("head@manipal.edu");
  if (headId) {
    await db
      .update(department)
      .set({ headId })
      .where(eq(department.id, target.id));
  }

  const associates = ["associatehead@manipal.edu", "associatehead2@manipal.edu"]
    .map((email) => byEmail.get(email))
    .filter((id): id is string => Boolean(id));

  await db
    .delete(departmentDeputy)
    .where(eq(departmentDeputy.departmentId, target.id));

  if (associates.length > 0) {
    await db
      .insert(departmentDeputy)
      .values(
        associates.map((userId) => ({ departmentId: target.id, userId })),
      );
  }

  console.log(
    `  + ${DEMO_DEPARTMENT}: head and ${associates.length} deputy(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });

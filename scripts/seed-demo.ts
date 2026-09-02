/**
 * Provisions demo accounts with known passwords for local development and the
 * end-to-end suite. Never run this against a real deployment.
 *
 *   pnpm seed:demo
 */
import { eq } from "drizzle-orm";

import { provisionUser } from "@/lib/auth/provision";
import { syncDesignatedRoles } from "@/lib/schools/sync";
import { db } from "@/lib/db";
import {
  role,
  school,
  schoolAssociateDean,
  user,
  userRole,
} from "@/lib/db/schema";
import { env } from "@/lib/env";

export const DEMO_PASSWORD = "Portal@123";

/** The school the demo accounts belong to. */
const DEMO_SCHOOL = "School of Computer Engineering";

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
    school: "School of Computer Engineering",
    designation: "Assistant Professor",
  },
  {
    email: "dean@manipal.edu",
    name: "Test Dean",
    roleName: "Dean",
    employeeId: "TEST-0002",
    school: "School of Computer Engineering",
    designation: "Dean",
  },
  {
    email: "associatedean@manipal.edu",
    name: "Test Associate Dean",
    roleName: "Associate Dean",
    employeeId: "TEST-0008",
    school: "School of Computer Engineering",
    designation: "Associate Dean",
  },
  {
    email: "associatedean2@manipal.edu",
    name: "Test Associate Dean Two",
    roleName: "Associate Dean",
    employeeId: "TEST-0009",
    school: "School of Computer Engineering",
    designation: "Associate Dean",
  },
  {
    email: "hr@manipal.edu",
    name: "Test HR Officer",
    roleName: "HR Officer",
    employeeId: "TEST-0003",
    school: null,
    designation: "HR Officer",
  },
  {
    email: "rc@manipal.edu",
    name: "Test R&C Officer",
    roleName: "R&C Officer",
    employeeId: "TEST-0004",
    school: null,
    designation: "Associate Director (R&C)",
  },
  {
    email: "fdw@manipal.edu",
    name: "Test FDW Officer",
    roleName: "FDW Officer",
    employeeId: "TEST-0005",
    school: null,
    designation: "Associate Director (FD&W)",
  },
  {
    email: "director@manipal.edu",
    name: "Test Director",
    roleName: "Director",
    employeeId: "TEST-0006",
    school: null,
    designation: "Director",
  },
  {
    email: "associatedirector@manipal.edu",
    name: "Test Associate Director",
    roleName: "Associate Director",
    employeeId: "TEST-0010",
    school: null,
    designation: "Associate Director",
  },
  {
    email: "institutehr@manipal.edu",
    name: "Test Institute HR",
    roleName: "Institute HR",
    employeeId: "TEST-0007",
    school: null,
    designation: "Institute HR",
  },
] as const;

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production.");
  }

  console.log("Seeding demo accounts");

  const schools = await db.select().from(school);
  const schoolIdByName = new Map(
    schools.map((entry) => [entry.name, entry.id]),
  );

  for (const demo of DEMO_USERS) {
    const provisioned = await provisionUser({
      email: demo.email,
      name: demo.name,
      employeeId: demo.employeeId,
      schoolId: demo.school ? (schoolIdByName.get(demo.school) ?? null) : null,
      designation: demo.designation,
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

  await linkSchoolSignatories();
  // The dean and associate dean roles follow the postings just made, exactly
  // as they do when an admin sets them from the schools page.
  await syncDesignatedRoles();

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}\n`);
}

/**
 * Gives the demo school its dean and associate deans.
 *
 * Without them the dean has nobody to send an application to and the process
 * stops at the first step, so a demo database is not much of a demo.
 */
async function linkSchoolSignatories() {
  const target = await db.query.school.findFirst({
    where: eq(school.name, DEMO_SCHOOL),
  });
  if (!target) {
    console.warn(`  ! school "${DEMO_SCHOOL}" not found - run pnpm seed first`);
    return;
  }

  const byEmail = new Map(
    (await db.select().from(user)).map((row) => [row.email, row.id]),
  );

  const deanId = byEmail.get("dean@manipal.edu");
  if (deanId) {
    await db.update(school).set({ deanId }).where(eq(school.id, target.id));
  }

  const associates = ["associatedean@manipal.edu", "associatedean2@manipal.edu"]
    .map((email) => byEmail.get(email))
    .filter((id): id is string => Boolean(id));

  await db
    .delete(schoolAssociateDean)
    .where(eq(schoolAssociateDean.schoolId, target.id));

  if (associates.length > 0) {
    await db
      .insert(schoolAssociateDean)
      .values(associates.map((userId) => ({ schoolId: target.id, userId })));
  }

  console.log(
    `  + ${DEMO_SCHOOL}: dean and ${associates.length} associate dean(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });

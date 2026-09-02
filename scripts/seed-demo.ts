/**
 * Provisions demo accounts with known passwords for local development and the
 * end-to-end suite. Never run this against a real deployment.
 *
 *   pnpm seed:demo
 */
import { eq } from "drizzle-orm";

import { provisionUser } from "@/lib/auth/provision";
import { db } from "@/lib/db";
import { role, school, user, userRole } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const DEMO_PASSWORD = "Portal@123";

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
    email: "hod@manipal.edu",
    name: "Test HOD",
    roleName: "HOD",
    employeeId: "TEST-0002",
    school: "School of Computer Engineering",
    designation: "Head of Department",
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

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  });

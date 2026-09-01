/**
 * Provisions demo accounts with known passwords for local development and the
 * end-to-end suite. Never run this against a real deployment.
 *
 *   pnpm seed:demo
 */
import { eq } from "drizzle-orm";

import { provisionUser } from "@/lib/auth/provision";
import { db } from "@/lib/db";
import { role, user, userRole } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const DEMO_PASSWORD = "Portal@123";

export const DEMO_USERS = [
  {
    email: "employee@manipal.edu",
    name: "Dr. Meera Shenoy",
    roleName: "Employee",
    employeeId: "MIT-5120",
    department: "Computer Science & Engineering",
    designation: "Assistant Professor",
  },
  {
    email: "hod@manipal.edu",
    name: "Prof. Ravi Kamath",
    roleName: "HOD",
    employeeId: "MIT-2201",
    department: "Computer Science & Engineering",
    designation: "Professor & Head",
  },
  {
    email: "hr@manipal.edu",
    name: "Ms. Anita Rao",
    roleName: "HR Officer",
    employeeId: "MIT-0311",
    department: "Human Resources",
    designation: "HR Officer",
  },
  {
    email: "rc@manipal.edu",
    name: "Prof. Girish Bhat",
    roleName: "R&C Officer",
    employeeId: "MIT-0142",
    department: "Research & Consultancy",
    designation: "Associate Director (R&C)",
  },
  {
    email: "fdw@manipal.edu",
    name: "Prof. Sunita Hegde",
    roleName: "FDW Officer",
    employeeId: "MIT-0158",
    department: "Faculty Development & Welfare",
    designation: "Associate Director (FD&W)",
  },
  {
    email: "director@manipal.edu",
    name: "Prof. Latha Nayak",
    roleName: "Director",
    employeeId: "MIT-1002",
    department: "Administration",
    designation: "Director",
  },
  {
    email: "institutehr@manipal.edu",
    name: "Mr. Suresh Pai",
    roleName: "Institute HR",
    employeeId: "MIT-0007",
    department: "Administration",
    designation: "Institute HR",
  },
] as const;

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production.");
  }

  console.log("Seeding demo accounts");

  for (const demo of DEMO_USERS) {
    const provisioned = await provisionUser({
      email: demo.email,
      name: demo.name,
      employeeId: demo.employeeId,
      department: demo.department,
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

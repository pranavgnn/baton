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
    email: "faculty@manipal.edu",
    name: "Dr. Meera Shenoy",
    roleName: "Faculty",
    employeeId: "MIT-5120",
    department: "Computer Science & Engineering",
    designation: "Assistant Professor",
  },
  {
    email: "hod@manipal.edu",
    name: "Prof. Ravi Kamath",
    roleName: "Head of Department",
    employeeId: "MIT-2201",
    department: "Computer Science & Engineering",
    designation: "Professor & Head",
  },
  {
    email: "dean@manipal.edu",
    name: "Prof. Latha Nayak",
    roleName: "Dean",
    employeeId: "MIT-1002",
    department: "Faculty of Engineering",
    designation: "Dean",
  },
  {
    email: "registrar@manipal.edu",
    name: "Mr. Suresh Pai",
    roleName: "Registrar",
    employeeId: "MIT-0007",
    department: "Administration",
    designation: "Registrar",
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

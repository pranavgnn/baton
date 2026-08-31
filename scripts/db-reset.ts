/**
 * Drops every table and re-applies the migrations from scratch.
 *
 * The `drizzle` schema holding the migration journal has to go too - leaving
 * it behind makes drizzle-kit believe the migrations are already applied and
 * you end up with an empty database it refuses to populate.
 *
 *   pnpm db:reset
 */
import { execFileSync } from "node:child_process";

import { db, pool } from "@/lib/db";
import { env } from "@/lib/env";
import { sql } from "drizzle-orm";

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to reset the database in production.");
  }

  console.log("Dropping schemas");
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await pool.end();

  console.log("Applying migrations");
  execFileSync("pnpm", ["db:migrate"], { stdio: "inherit", shell: true });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  });

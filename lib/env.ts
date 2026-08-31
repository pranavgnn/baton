import { z } from "zod";

/**
 * Server-side environment. Parsed once at module load so a misconfigured
 * deployment fails fast instead of surfacing as a runtime null somewhere deep
 * inside a server action.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_SECURE: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  MAIL_FROM: z.string().default("MIT Promotion Portal <no-reply@manipal.edu>"),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_PUBLIC_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("promotion-portal"),
  S3_ACCESS_KEY_ID: z.string().default("minioadmin"),
  S3_SECRET_ACCESS_KEY: z.string().default("minioadmin"),

  SUPER_ADMIN_EMAIL: z.email().default("superadmin@manipal.edu"),
  SUPER_ADMIN_NAME: z.string().default("Super Admin"),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default("SuperAdmin@123"),
});

function loadEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export type Env = typeof env;

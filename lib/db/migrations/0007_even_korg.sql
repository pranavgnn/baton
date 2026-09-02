ALTER TABLE "role" ADD COLUMN "designation" text;--> statement-breakpoint
ALTER TABLE "user_role" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "role_designation_uidx" ON "role" USING btree ("designation");
ALTER TABLE "role" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "role_priority_idx" ON "role" USING btree ("priority");
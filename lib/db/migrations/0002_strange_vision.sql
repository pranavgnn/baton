CREATE TABLE "workflow_version" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"memo" text,
	"published_by" text,
	"published_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_version_workflow_version_uidx" ON "workflow_version" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "workflow_version_created_at_idx" ON "workflow_version" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "workflow" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "workflow" DROP COLUMN "description";
CREATE TABLE "school" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"dean_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_associate_dean" (
	"school_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_associate_dean_school_id_user_id_pk" PRIMARY KEY("school_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "assigned_to_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_dean_id_user_id_fk" FOREIGN KEY ("dean_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_associate_dean" ADD CONSTRAINT "school_associate_dean_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_associate_dean" ADD CONSTRAINT "school_associate_dean_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_name_uidx" ON "school" USING btree ("name");--> statement-breakpoint
CREATE INDEX "school_associate_dean_user_id_idx" ON "school_associate_dean" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;
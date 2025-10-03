CREATE TABLE "sde" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sde_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"release_date" timestamp DEFAULT now() NOT NULL,
	"release_version" text NOT NULL,
	"run_date" timestamp DEFAULT now() NOT NULL,
	"success" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sde_data" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sde_data" CASCADE;--> statement-breakpoint
ALTER TABLE "scan_groups" DROP CONSTRAINT "scan_groups_system_systems_id_fk";
--> statement-breakpoint
ALTER TABLE "scan_groups" ALTER COLUMN "system" SET DATA TYPE json USING NULL;
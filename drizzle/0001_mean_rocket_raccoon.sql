CREATE TABLE IF NOT EXISTS "sde_data" (
	"id" text PRIMARY KEY NOT NULL,
	"install_date" timestamp DEFAULT now() NOT NULL,
	"fsd_checksum" text NOT NULL,
	"bsd_checksum" text NOT NULL,
	"universe_checksum" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scans" ALTER COLUMN "data" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "corporations" ADD COLUMN "npc" boolean DEFAULT false NOT NULL;
CREATE TYPE "public"."scanTypes" AS ENUM('local', 'directional');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alliances" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "characters" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sec_status" double precision DEFAULT 0 NOT NULL,
	"corporation_id" bigint NOT NULL,
	"alliance_id" bigint,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "corporations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"alliance_id" bigint,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"system" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"scan_type" "scanTypes" NOT NULL,
	"data" jsonb NOT NULL,
	"raw_data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "systems" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"constellation" text NOT NULL,
	"region" text NOT NULL,
	"sec_status" double precision NOT NULL,
	"last_seen" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "characters" ADD CONSTRAINT "characters_corporation_id_corporations_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."corporations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "characters" ADD CONSTRAINT "characters_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corporations" ADD CONSTRAINT "corporations_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_groups" ADD CONSTRAINT "scan_groups_system_systems_id_fk" FOREIGN KEY ("system") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scans" ADD CONSTRAINT "scans_group_id_scan_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scan_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TYPE "public"."scanTypes" AS ENUM('local', 'directional');--> statement-breakpoint
CREATE TABLE "alliances" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sec_status" double precision DEFAULT 0 NOT NULL,
	"corporation_id" bigint NOT NULL,
	"alliance_id" bigint,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"esi_cache_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "corporations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"alliance_id" bigint,
	"npc" boolean DEFAULT false NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_categories" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_groups" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"anchorable" boolean DEFAULT false NOT NULL,
	"anchored" boolean DEFAULT false NOT NULL,
	"fittable_non_singleton" boolean DEFAULT false NOT NULL,
	"category_id" bigint NOT NULL,
	"icon_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inv_types" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mass" double precision DEFAULT 0 NOT NULL,
	"volume" double precision DEFAULT 0 NOT NULL,
	"capacity" double precision,
	"faction_id" integer DEFAULT 0 NOT NULL,
	"race_id" integer DEFAULT 0 NOT NULL,
	"group_id" bigint NOT NULL,
	"market_group_id" integer,
	"icon_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."scan_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"system" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."scans" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"scan_type" "scanTypes" NOT NULL,
	"data" json NOT NULL,
	"raw_data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sde" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sde_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"release_date" timestamp DEFAULT now() NOT NULL,
	"release_version" bigint NOT NULL,
	"run_date" timestamp DEFAULT now() NOT NULL,
	"success" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"constellation" text NOT NULL,
	"region" text NOT NULL,
	"sec_status" double precision NOT NULL,
	"last_seen" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_corporation_id_corporations_id_fk" FOREIGN KEY ("corporation_id") REFERENCES "public"."corporations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporations" ADD CONSTRAINT "corporations_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_groups" ADD CONSTRAINT "inv_groups_category_id_inv_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inv_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_types" ADD CONSTRAINT "inv_types_group_id_inv_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."inv_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."scans" ADD CONSTRAINT "scans_group_id_scan_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "dev"."scan_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alliances_refresh_idx" ON "alliances" USING btree ("last_seen","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_idx" ON "characters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "characters_refresh_idx" ON "characters" USING btree ("deleted_at","updated_at","last_seen");--> statement-breakpoint
CREATE INDEX "corporations_refresh_idx" ON "corporations" USING btree ("last_seen","updated_at");--> statement-breakpoint
CREATE INDEX "scan_groups_public_created_idx" ON "dev"."scan_groups" USING btree ("public","created_at");--> statement-breakpoint
CREATE INDEX "scans_group_id_idx" ON "dev"."scans" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "scans_created_at_idx" ON "dev"."scans" USING btree ("created_at");
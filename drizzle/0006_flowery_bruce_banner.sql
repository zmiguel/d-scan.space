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
ALTER TABLE "inv_groups" ADD CONSTRAINT "inv_groups_category_id_inv_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inv_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_types" ADD CONSTRAINT "inv_types_group_id_inv_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."inv_groups"("id") ON DELETE no action ON UPDATE no action;
DROP TABLE IF EXISTS "sde_data";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sde_data" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sde_data_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"install_date" timestamp DEFAULT now() NOT NULL,
	"fsd_checksum" text NOT NULL,
	"bsd_checksum" text NOT NULL,
	"universe_checksum" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL
);
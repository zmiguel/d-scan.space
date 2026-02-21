ALTER TABLE "dev"."scan_groups" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "dev"."scans" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "dev"."scan_groups" ADD CONSTRAINT "scan_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."scans" ADD CONSTRAINT "scans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview"."scan_groups" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "preview"."scans" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "preview"."scan_groups" ADD CONSTRAINT "scan_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview"."scans" ADD CONSTRAINT "scans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prod"."scan_groups" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "prod"."scans" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "prod"."scan_groups" ADD CONSTRAINT "scan_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prod"."scans" ADD CONSTRAINT "scans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_character_name_idx" ON "auth"."account" USING btree ("character_name");--> statement-breakpoint
CREATE INDEX "user_primary_character_idx" ON "auth"."user" USING btree ("primary_character_id");--> statement-breakpoint
CREATE INDEX "user_name_idx" ON "auth"."user" USING btree ("name");--> statement-breakpoint
CREATE INDEX "scan_groups_created_by_idx" ON "dev"."scan_groups" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "scan_groups_public_idx" ON "dev"."scan_groups" USING btree ("public");--> statement-breakpoint
CREATE INDEX "scan_groups_created_by_public_idx" ON "dev"."scan_groups" USING btree ("created_by","public");--> statement-breakpoint
CREATE INDEX "scans_scan_type_idx" ON "dev"."scans" USING btree ("scan_type");--> statement-breakpoint
CREATE INDEX "scans_created_by_idx" ON "dev"."scans" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "scans_scan_type_created_idx" ON "dev"."scans" USING btree ("scan_type","created_by");--> statement-breakpoint
CREATE INDEX "scans_group_id_scan_type_created_idx" ON "dev"."scans" USING btree ("group_id","scan_type","created_by");
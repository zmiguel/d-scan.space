CREATE INDEX "alliances_refresh_idx" ON "alliances" USING btree ("last_seen","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_idx" ON "characters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "characters_refresh_idx" ON "characters" USING btree ("deleted_at","updated_at","last_seen");--> statement-breakpoint
CREATE INDEX "corporations_refresh_idx" ON "corporations" USING btree ("last_seen","updated_at");--> statement-breakpoint
CREATE INDEX "scan_groups_public_created_idx" ON "scan_groups" USING btree ("public","created_at");--> statement-breakpoint
CREATE INDEX "scans_group_id_idx" ON "scans" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "scans_created_at_idx" ON "scans" USING btree ("created_at");
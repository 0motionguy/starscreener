DROP INDEX "tr"."watchlists_profile_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_profile_uniq" ON "tr"."watchlists" USING btree ("profile_id");
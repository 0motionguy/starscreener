CREATE SCHEMA "tr";
--> statement-breakpoint
CREATE TABLE "tr"."alert_delivery_log" (
	"rule_id" uuid NOT NULL,
	"deduped_key" text NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"delivery_channel" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"deduped_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "tr"."alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"watchlist_id" uuid,
	"name" text NOT NULL,
	"rule_type" text NOT NULL,
	"rule_config" jsonb NOT NULL,
	"cadence" text DEFAULT 'realtime' NOT NULL,
	"webhook_url" text,
	"webhook_secret_hash" text,
	"quiet_hours" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"fire_count_today" integer DEFAULT 0 NOT NULL,
	"fire_count_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"email_alerts_cadence" text DEFAULT 'daily' NOT NULL,
	"email_referral_updates" boolean DEFAULT true NOT NULL,
	"email_product_updates" boolean DEFAULT false NOT NULL,
	"email_system" boolean DEFAULT true NOT NULL,
	"quiet_hours" jsonb,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"referral_credits" integer DEFAULT 0 NOT NULL,
	"dismissed_invite_banner_at" timestamp with time zone,
	"public_leaderboard_optin" boolean DEFAULT false NOT NULL,
	"mcp_token_hash" text,
	"mcp_token_last4" text
);
--> statement-breakpoint
CREATE TABLE "tr"."watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"repo_full_name" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stars_at_add" text
);
--> statement-breakpoint
CREATE TABLE "tr"."watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"confirm_token_hash" text NOT NULL,
	"unsubscribe_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."referral_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tr"."referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_profile_id" uuid NOT NULL,
	"referred_profile_id" uuid,
	"referral_code" text NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_up_at" timestamp with time zone,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"first_landing_url" text,
	"user_agent" text,
	"ip_hash" text,
	"fraud_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tr"."alert_delivery_log" ADD CONSTRAINT "alert_delivery_log_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "tr"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "tr"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."alert_events" ADD CONSTRAINT "alert_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."alert_rules" ADD CONSTRAINT "alert_rules_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."alert_rules" ADD CONSTRAINT "alert_rules_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "tr"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "tr"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."watchlists" ADD CONSTRAINT "watchlists_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."referral_codes" ADD CONSTRAINT "referral_codes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."referral_milestones" ADD CONSTRAINT "referral_milestones_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."referrals" ADD CONSTRAINT "referrals_referrer_profile_id_profiles_id_fk" FOREIGN KEY ("referrer_profile_id") REFERENCES "tr"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tr"."referrals" ADD CONSTRAINT "referrals_referred_profile_id_profiles_id_fk" FOREIGN KEY ("referred_profile_id") REFERENCES "tr"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_delivery_log_pk" ON "tr"."alert_delivery_log" USING btree ("rule_id","deduped_key");--> statement-breakpoint
CREATE INDEX "alert_delivery_log_expires_idx" ON "tr"."alert_delivery_log" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_rule_dedup_uniq" ON "tr"."alert_events" USING btree ("rule_id","deduped_key");--> statement-breakpoint
CREATE INDEX "alert_events_rule_fired_idx" ON "tr"."alert_events" USING btree ("rule_id","fired_at");--> statement-breakpoint
CREATE INDEX "alert_events_profile_fired_idx" ON "tr"."alert_events" USING btree ("profile_id","fired_at");--> statement-breakpoint
CREATE INDEX "alert_events_pending_idx" ON "tr"."alert_events" USING btree ("delivery_status","fired_at") WHERE delivery_status = 'pending';--> statement-breakpoint
CREATE INDEX "alert_rules_profile_active_idx" ON "tr"."alert_rules" USING btree ("profile_id","active");--> statement-breakpoint
CREATE INDEX "alert_rules_type_active_idx" ON "tr"."alert_rules" USING btree ("rule_type","active");--> statement-breakpoint
CREATE INDEX "alert_rules_watchlist_idx" ON "tr"."alert_rules" USING btree ("watchlist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_clerk_user_id_uniq" ON "tr"."profiles" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_uniq" ON "tr"."profiles" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_lower_uniq" ON "tr"."profiles" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "tr"."profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_uniq" ON "tr"."watchlist_items" USING btree ("watchlist_id","repo_full_name");--> statement-breakpoint
CREATE INDEX "watchlist_items_repo_idx" ON "tr"."watchlist_items" USING btree ("repo_full_name");--> statement-breakpoint
CREATE INDEX "watchlists_profile_idx" ON "tr"."watchlists" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_email_uniq" ON "tr"."newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "newsletter_unsub_token_idx" ON "tr"."newsletter_subscribers" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_profile_uniq" ON "tr"."referral_codes" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_uniq" ON "tr"."referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_lower_uniq" ON "tr"."referral_codes" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "referral_milestones_uniq" ON "tr"."referral_milestones" USING btree ("profile_id","milestone_key");--> statement-breakpoint
CREATE INDEX "referral_milestones_profile_idx" ON "tr"."referral_milestones" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_uniq" ON "tr"."referrals" USING btree ("referred_profile_id") WHERE "tr"."referrals"."referred_profile_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "referrals_referrer_qualified_idx" ON "tr"."referrals" USING btree ("referrer_profile_id","qualified_at");--> statement-breakpoint
CREATE INDEX "referrals_ip_recent_idx" ON "tr"."referrals" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "referrals_code_idx" ON "tr"."referrals" USING btree ("referral_code");
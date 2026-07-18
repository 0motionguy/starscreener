CREATE TABLE "tr"."user_tiers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"expires_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_tiers_stripe_customer_idx" ON "tr"."user_tiers" USING btree ("stripe_customer_id");
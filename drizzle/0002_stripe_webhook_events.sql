CREATE TABLE "tr"."stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text,
	"livemode" boolean NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_redacted" text,
	"payload_sha256" text NOT NULL,
	"event_created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_object_idx" ON "tr"."stripe_webhook_events" USING btree ("object_id","status");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_idx" ON "tr"."stripe_webhook_events" USING btree ("status");
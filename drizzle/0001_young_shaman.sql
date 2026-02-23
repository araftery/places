ALTER TABLE "places" ADD COLUMN "closed_permanently" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "business_status_checked_at" timestamp;
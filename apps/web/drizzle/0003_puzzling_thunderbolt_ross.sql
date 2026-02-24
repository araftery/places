CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"providers" jsonb DEFAULT '["google"]'::jsonb NOT NULL,
	"infatuation_slug" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"last_audited_at" timestamp,
	"next_audit_at" timestamp,
	"status" text DEFAULT 'pending',
	"error" text
);
--> statement-breakpoint
ALTER TABLE "place_ratings" ALTER COLUMN "rating" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "place_ratings" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "place_ratings" ADD COLUMN "rating_max" real;--> statement-breakpoint
ALTER TABLE "place_ratings" ADD COLUMN "review_count" integer;--> statement-breakpoint
ALTER TABLE "place_ratings" ADD COLUMN "review_date" timestamp;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "city_id" integer;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "been_there" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "reservation_provider" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "reservation_external_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "reservation_url" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "opening_window_days" integer;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "opening_time" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "opening_pattern" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "opening_bulk_description" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "last_available_date" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "last_reservation_check" timestamp;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "reservation_notes" text;--> statement-breakpoint
ALTER TABLE "place_audits" ADD CONSTRAINT "place_audits_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cities_name_country_idx" ON "cities" USING btree ("name","country");--> statement-breakpoint
CREATE UNIQUE INDEX "place_audits_place_provider_idx" ON "place_audits" USING btree ("place_id","provider");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "hours_last_fetched";--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "business_status_checked_at";
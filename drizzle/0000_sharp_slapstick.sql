CREATE TABLE "place_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"source" text NOT NULL,
	"rating" text,
	"notes" text,
	"rating_url" text,
	"last_fetched" timestamp
);
--> statement-breakpoint
CREATE TABLE "place_tags" (
	"place_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "place_tags_place_id_tag_id_pk" PRIMARY KEY("place_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"city" text,
	"neighborhood" text,
	"place_type" text,
	"cuisine_type" jsonb,
	"price_range" smallint,
	"website_url" text,
	"menu_url" text,
	"phone" text,
	"status" text DEFAULT 'want_to_try' NOT NULL,
	"personal_notes" text,
	"source" text,
	"google_place_id" text,
	"hours_json" jsonb,
	"hours_last_fetched" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "places_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "place_ratings" ADD CONSTRAINT "place_ratings_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
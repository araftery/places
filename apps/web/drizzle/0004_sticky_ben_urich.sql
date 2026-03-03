CREATE TABLE "cuisines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cuisines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "place_cuisines" (
	"place_id" integer NOT NULL,
	"cuisine_id" integer NOT NULL,
	CONSTRAINT "place_cuisines_place_id_cuisine_id_pk" PRIMARY KEY("place_id","cuisine_id")
);
--> statement-breakpoint
CREATE TABLE "place_lists" (
	"place_id" integer NOT NULL,
	"list_id" integer NOT NULL,
	CONSTRAINT "place_lists_place_id_list_id_pk" PRIMARY KEY("place_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "opening_time" SET DATA TYPE time;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "michelin_city_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "cities" SET "michelin_city_slugs" = CASE WHEN "michelin_city_slug" IS NOT NULL THEN jsonb_build_array("michelin_city_slug") ELSE '[]'::jsonb END;--> statement-breakpoint
ALTER TABLE "cities" DROP COLUMN "michelin_city_slug";--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "google_place_type" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "last_successful_reservation_check" timestamp;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "last_reservation_check_status" text;--> statement-breakpoint
ALTER TABLE "place_cuisines" ADD CONSTRAINT "place_cuisines_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_cuisines" ADD CONSTRAINT "place_cuisines_cuisine_id_cuisines_id_fk" FOREIGN KEY ("cuisine_id") REFERENCES "public"."cuisines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_lists" ADD CONSTRAINT "place_lists_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_lists" ADD CONSTRAINT "place_lists_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "cuisine_type";
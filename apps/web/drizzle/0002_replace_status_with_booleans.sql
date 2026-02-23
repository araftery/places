ALTER TABLE "places" ADD COLUMN "been_there" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "places" SET "been_there" = true WHERE "status" = 'been_there';--> statement-breakpoint
UPDATE "places" SET "archived" = true WHERE "status" = 'archived';--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "status";

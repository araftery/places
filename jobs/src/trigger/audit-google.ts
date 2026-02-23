import { schedules, logger } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { places, placeAudits } from "@places/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { scrapeGoogle } from "../providers/google";
import { upsertRating, upsertAudit, markAuditFailed } from "../utils/ratings";
import { extractError } from "../utils/errors";

const BATCH_SIZE = 50;
const DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const auditGoogleTask = schedules.task({
  id: "audit-google",
  cron: "0 6 * * 0", // Weekly, Sundays 6 AM UTC
  run: async () => {
    logger.info("Starting Google audit", { batchSize: BATCH_SIZE });

    // Find place_audits rows where google audit is due
    const dueAudits = await db
      .select({
        auditId: placeAudits.id,
        placeId: placeAudits.placeId,
        externalId: placeAudits.externalId,
      })
      .from(placeAudits)
      .where(
        and(
          eq(placeAudits.provider, "google"),
          lte(placeAudits.nextAuditAt, sql`now()`)
        )
      )
      .limit(BATCH_SIZE);

    logger.info("Google audits due", {
      count: dueAudits.length,
      batchSize: BATCH_SIZE,
      atCapacity: dueAudits.length === BATCH_SIZE,
    });

    if (dueAudits.length === 0) {
      logger.info("No Google audits due, exiting");
      return;
    }

    let updated = 0;
    let notFound = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < dueAudits.length; i++) {
      const audit = dueAudits[i];

      try {
        const [place] = await db
          .select()
          .from(places)
          .where(eq(places.id, audit.placeId));

        if (!place) {
          logger.warn("Place not found for audit, skipping", {
            placeId: audit.placeId,
            auditId: audit.auditId,
            progress: `${i + 1}/${dueAudits.length}`,
          });
          skipped++;
          continue;
        }

        logger.log("Processing Google audit", {
          placeId: place.id,
          placeName: place.name,
          googlePlaceId: place.googlePlaceId,
          progress: `${i + 1}/${dueAudits.length}`,
        });

        const result = await scrapeGoogle({
          id: place.id,
          name: place.name,
          googlePlaceId: place.googlePlaceId,
        });

        if (result.ratingData) {
          await upsertRating(place.id, result.ratingData);
        }

        if (result.placeData) {
          await db
            .update(places)
            .set({
              ...result.placeData,
              updatedAt: new Date(),
            })
            .where(eq(places.id, place.id));
        }

        await upsertAudit(place.id, "google", result, 7);

        if (result.found) {
          updated++;
        } else {
          notFound++;
        }
      } catch (err) {
        const { fullMessage, type, stack, cause } = extractError(err);
        logger.error("Google audit failed for place", {
          placeId: audit.placeId,
          auditId: audit.auditId,
          error: fullMessage,
          errorType: type,
          cause,
          stack,
          progress: `${i + 1}/${dueAudits.length}`,
        });
        await markAuditFailed(audit.placeId, "google", fullMessage);
        failed++;
      }

      if (i < dueAudits.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    logger.info("Google audit complete", {
      total: dueAudits.length,
      updated,
      notFound,
      skipped,
      failed,
    });
  },
});

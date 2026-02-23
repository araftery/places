import { schedules, logger } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { places, placeAudits, cities } from "@places/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { scrapeInfatuation } from "../providers/infatuation";
import { upsertRating, upsertAudit, markAuditFailed } from "../utils/ratings";
import { extractError } from "../utils/errors";
import { generateSessionId } from "../utils/clients";

const BATCH_SIZE = 30;

export const auditInfatuationTask = schedules.task({
  id: "audit-infatuation",
  cron: "0 8 1 * *", // Monthly, 1st at 8 AM UTC
  run: async () => {
    const sessionId = generateSessionId();
    logger.info("Starting Infatuation audit", { batchSize: BATCH_SIZE, sessionId });

    const dueAudits = await db
      .select({
        auditId: placeAudits.id,
        placeId: placeAudits.placeId,
        externalId: placeAudits.externalId,
      })
      .from(placeAudits)
      .where(
        and(
          eq(placeAudits.provider, "infatuation"),
          lte(placeAudits.nextAuditAt, sql`now()`)
        )
      )
      .limit(BATCH_SIZE);

    logger.info("Infatuation audits due", {
      count: dueAudits.length,
      batchSize: BATCH_SIZE,
      atCapacity: dueAudits.length === BATCH_SIZE,
    });

    if (dueAudits.length === 0) {
      logger.info("No Infatuation audits due, exiting");
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

        let cityName: string | null = null;
        let infatuationSlug: string | null = null;
        if (place.cityId) {
          const [city] = await db
            .select()
            .from(cities)
            .where(eq(cities.id, place.cityId));
          cityName = city?.name ?? null;
          infatuationSlug = city?.infatuationSlug ?? null;
        }

        if (!infatuationSlug && !audit.externalId) {
          logger.info("Skipping Infatuation audit — no city slug configured", {
            placeId: place.id,
            placeName: place.name,
            cityName,
            progress: `${i + 1}/${dueAudits.length}`,
          });
          skipped++;
          continue;
        }

        logger.log("Processing Infatuation audit", {
          placeId: place.id,
          placeName: place.name,
          city: cityName,
          infatuationSlug,
          hasExistingSlug: !!audit.externalId,
          progress: `${i + 1}/${dueAudits.length}`,
        });

        const result = await scrapeInfatuation(
          {
            id: place.id,
            name: place.name,
            cityName,
            infatuationSlug,
            lat: place.lat,
            lng: place.lng,
          },
          audit.externalId,
          sessionId
        );

        if (result.ratingData) {
          await upsertRating(place.id, result.ratingData);
        }

        await upsertAudit(place.id, "infatuation", result, 30);

        if (result.found) {
          updated++;
        } else {
          notFound++;
        }
      } catch (err) {
        const { fullMessage, type, stack, cause } = extractError(err);
        logger.error("Infatuation audit failed for place", {
          placeId: audit.placeId,
          auditId: audit.auditId,
          error: fullMessage,
          errorType: type,
          cause,
          stack,
          progress: `${i + 1}/${dueAudits.length}`,
        });
        await markAuditFailed(audit.placeId, "infatuation", fullMessage);
        failed++;
      }
    }

    logger.info("Infatuation audit complete", {
      total: dueAudits.length,
      updated,
      notFound,
      skipped,
      failed,
    });
  },
});

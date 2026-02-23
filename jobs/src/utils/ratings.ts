import { logger } from "@trigger.dev/sdk";
import { db } from "@places/db";
import { placeRatings, placeAudits } from "@places/db/schema";
import { eq, and } from "drizzle-orm";

export interface ScrapeResult {
  found: boolean;
  externalId: string | null;
  ratingData: {
    source: string;
    rating: string | null;
    notes: string | null;
    ratingUrl: string | null;
    externalId: string | null;
  } | null;
  placeData: Record<string, unknown> | null;
}

export async function upsertRating(
  placeId: number,
  data: {
    source: string;
    rating: string | null;
    notes: string | null;
    ratingUrl: string | null;
    externalId: string | null;
  }
) {
  // Check if a rating from this source already exists
  const existing = await db
    .select()
    .from(placeRatings)
    .where(
      and(
        eq(placeRatings.placeId, placeId),
        eq(placeRatings.source, data.source)
      )
    );

  if (existing.length > 0) {
    const prev = existing[0];
    const changed =
      prev.rating !== data.rating ||
      prev.notes !== data.notes ||
      prev.ratingUrl !== data.ratingUrl;

    await db
      .update(placeRatings)
      .set({
        rating: data.rating,
        notes: data.notes,
        ratingUrl: data.ratingUrl,
        externalId: data.externalId,
        lastFetched: new Date(),
      })
      .where(eq(placeRatings.id, existing[0].id));

    logger.log(changed ? "Rating updated" : "Rating unchanged", {
      placeId,
      source: data.source,
      rating: data.rating,
      previousRating: prev.rating,
      ratingId: existing[0].id,
    });
  } else {
    await db.insert(placeRatings).values({
      placeId,
      source: data.source,
      rating: data.rating,
      notes: data.notes,
      ratingUrl: data.ratingUrl,
      externalId: data.externalId,
      lastFetched: new Date(),
    });

    logger.log("Rating created", {
      placeId,
      source: data.source,
      rating: data.rating,
    });
  }
}

export async function upsertAudit(
  placeId: number,
  provider: string,
  result: ScrapeResult,
  nextAuditDays: number
) {
  const nextAuditAt = new Date();
  nextAuditAt.setDate(nextAuditAt.getDate() + nextAuditDays);

  const existing = await db
    .select()
    .from(placeAudits)
    .where(
      and(
        eq(placeAudits.placeId, placeId),
        eq(placeAudits.provider, provider)
      )
    );

  const status = result.found ? "success" : "not_found";

  const auditData = {
    externalId: result.externalId,
    lastAuditedAt: new Date(),
    nextAuditAt,
    status,
    error: null,
  };

  if (existing.length > 0) {
    await db
      .update(placeAudits)
      .set(auditData)
      .where(eq(placeAudits.id, existing[0].id));
  } else {
    await db.insert(placeAudits).values({
      placeId,
      provider,
      ...auditData,
    });
  }

  logger.log("Audit recorded", {
    placeId,
    provider,
    status,
    externalId: result.externalId,
    nextAuditAt: nextAuditAt.toISOString(),
    nextAuditDays,
    isNew: existing.length === 0,
  });
}

export async function markAuditFailed(
  placeId: number,
  provider: string,
  error: string
) {
  const existing = await db
    .select()
    .from(placeAudits)
    .where(
      and(
        eq(placeAudits.placeId, placeId),
        eq(placeAudits.provider, provider)
      )
    );

  const auditData = {
    lastAuditedAt: new Date(),
    status: "failed",
    error,
  };

  if (existing.length > 0) {
    await db
      .update(placeAudits)
      .set(auditData)
      .where(eq(placeAudits.id, existing[0].id));
  } else {
    await db.insert(placeAudits).values({
      placeId,
      provider,
      externalId: null,
      nextAuditAt: null,
      ...auditData,
    });
  }

  logger.error("Audit failed", {
    placeId,
    provider,
    error,
    isNew: existing.length === 0,
  });
}

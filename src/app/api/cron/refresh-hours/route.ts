import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places } from "@/db/schema";
import { eq, isNotNull, asc } from "drizzle-orm";
import { getPlaceDetails } from "@/lib/google-places";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
const DELAY_MS = 200;
const STALE_DAYS = 7;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - STALE_DAYS);

  // Get places with a googlePlaceId, ordered by oldest hoursLastFetched first
  // (nulls sort first in Postgres ascending order)
  const candidates = await db
    .select({
      id: places.id,
      googlePlaceId: places.googlePlaceId,
      hoursLastFetched: places.hoursLastFetched,
    })
    .from(places)
    .where(isNotNull(places.googlePlaceId))
    .orderBy(asc(places.hoursLastFetched))
    .limit(BATCH_SIZE);

  // Filter to only stale ones (never fetched or older than STALE_DAYS)
  const toRefresh = candidates.filter(
    (p) => !p.hoursLastFetched || p.hoursLastFetched <= staleDate
  );

  let updated = 0;
  let failed = 0;
  const errors: Array<{ placeId: number; error: string }> = [];

  for (let i = 0; i < toRefresh.length; i++) {
    const place = toRefresh[i];
    try {
      const details = await getPlaceDetails(place.googlePlaceId!);

      await db
        .update(places)
        .set({
          hoursJson: details.regularOpeningHours ?? null,
          hoursLastFetched: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(places.id, place.id));

      updated++;
    } catch (err) {
      failed++;
      errors.push({
        placeId: place.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Rate limiting delay between API calls
    if (i < toRefresh.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return NextResponse.json({
    total: candidates.length,
    stale: toRefresh.length,
    updated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}

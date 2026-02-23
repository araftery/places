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
  const startTime = Date.now();
  console.log("[refresh-hours] Cron job started");

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[refresh-hours] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - STALE_DAYS);

  // Get places with a googlePlaceId, ordered by oldest hoursLastFetched first
  // (nulls sort first in Postgres ascending order)
  const candidates = await db
    .select({
      id: places.id,
      name: places.name,
      googlePlaceId: places.googlePlaceId,
      hoursLastFetched: places.hoursLastFetched,
    })
    .from(places)
    .where(isNotNull(places.googlePlaceId))
    .orderBy(asc(places.hoursLastFetched))
    .limit(BATCH_SIZE);

  console.log(
    `[refresh-hours] Found ${candidates.length} candidates (limit ${BATCH_SIZE})`
  );

  // Filter to only stale ones (never fetched or older than STALE_DAYS)
  const toRefresh = candidates.filter(
    (p) => !p.hoursLastFetched || p.hoursLastFetched <= staleDate
  );

  console.log(
    `[refresh-hours] ${toRefresh.length} of ${candidates.length} are stale (>${STALE_DAYS} days or never fetched)`
  );

  if (toRefresh.length === 0) {
    const elapsed = Date.now() - startTime;
    console.log(`[refresh-hours] Nothing to refresh. Done in ${elapsed}ms`);
    return NextResponse.json({
      total: candidates.length,
      stale: 0,
      updated: 0,
      failed: 0,
      elapsedMs: elapsed,
    });
  }

  let updated = 0;
  let failed = 0;
  const errors: Array<{ placeId: number; name: string; error: string }> = [];

  for (let i = 0; i < toRefresh.length; i++) {
    const place = toRefresh[i];
    const lastFetched = place.hoursLastFetched
      ? place.hoursLastFetched.toISOString()
      : "never";

    try {
      console.log(
        `[refresh-hours] [${i + 1}/${toRefresh.length}] Fetching hours for "${place.name}" (id=${place.id}, lastFetched=${lastFetched})`
      );

      const details = await getPlaceDetails(place.googlePlaceId!);
      const hasHours = !!details.regularOpeningHours;

      await db
        .update(places)
        .set({
          hoursJson: details.regularOpeningHours ?? null,
          hoursLastFetched: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(places.id, place.id));

      updated++;
      console.log(
        `[refresh-hours] [${i + 1}/${toRefresh.length}] Updated "${place.name}" — hours ${hasHours ? "found" : "not available"}`
      );
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        placeId: place.id,
        name: place.name,
        error: errorMsg,
      });
      console.error(
        `[refresh-hours] [${i + 1}/${toRefresh.length}] FAILED "${place.name}" (id=${place.id}): ${errorMsg}`
      );
    }

    // Rate limiting delay between API calls
    if (i < toRefresh.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[refresh-hours] Done in ${elapsed}ms — ${updated} updated, ${failed} failed out of ${toRefresh.length} stale`
  );

  if (errors.length > 0) {
    console.warn(
      `[refresh-hours] Errors:`,
      JSON.stringify(errors, null, 2)
    );
  }

  return NextResponse.json({
    total: candidates.length,
    stale: toRefresh.length,
    updated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    elapsedMs: elapsed,
  });
}

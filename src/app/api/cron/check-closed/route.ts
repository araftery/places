import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places } from "@/db/schema";
import { eq, isNotNull, asc, ne } from "drizzle-orm";
import { getPlaceDetails } from "@/lib/google-places";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
const DELAY_MS = 200;
const STALE_DAYS = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log("[check-closed] Cron job started");

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[check-closed] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - STALE_DAYS);

  // Get non-archived places with a googlePlaceId, ordered by oldest check first
  const candidates = await db
    .select({
      id: places.id,
      name: places.name,
      googlePlaceId: places.googlePlaceId,
      status: places.status,
      businessStatusCheckedAt: places.businessStatusCheckedAt,
    })
    .from(places)
    .where(isNotNull(places.googlePlaceId))
    .orderBy(asc(places.businessStatusCheckedAt))
    .limit(BATCH_SIZE);

  console.log(
    `[check-closed] Found ${candidates.length} candidates (limit ${BATCH_SIZE})`
  );

  // Filter to only those not checked in the last STALE_DAYS
  const toCheck = candidates.filter(
    (p) => !p.businessStatusCheckedAt || p.businessStatusCheckedAt <= staleDate
  );

  console.log(
    `[check-closed] ${toCheck.length} of ${candidates.length} need checking (>${STALE_DAYS} days or never checked)`
  );

  if (toCheck.length === 0) {
    const elapsed = Date.now() - startTime;
    console.log(`[check-closed] Nothing to check. Done in ${elapsed}ms`);
    return NextResponse.json({
      total: candidates.length,
      checked: 0,
      newlyClosed: 0,
      failed: 0,
      elapsedMs: elapsed,
    });
  }

  let checked = 0;
  let newlyClosed = 0;
  let failed = 0;
  const errors: Array<{ placeId: number; name: string; error: string }> = [];
  const closedPlaces: Array<{ id: number; name: string }> = [];

  for (let i = 0; i < toCheck.length; i++) {
    const place = toCheck[i];

    try {
      console.log(
        `[check-closed] [${i + 1}/${toCheck.length}] Checking "${place.name}" (id=${place.id})`
      );

      const details = await getPlaceDetails(place.googlePlaceId!);
      const isClosed = details.businessStatus === "CLOSED_PERMANENTLY";

      await db
        .update(places)
        .set({
          closedPermanently: isClosed,
          businessStatusCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(places.id, place.id));

      checked++;

      if (isClosed) {
        newlyClosed++;
        closedPlaces.push({ id: place.id, name: place.name });
        console.log(
          `[check-closed] [${i + 1}/${toCheck.length}] "${place.name}" is CLOSED PERMANENTLY`
        );
      } else {
        console.log(
          `[check-closed] [${i + 1}/${toCheck.length}] "${place.name}" is operational (status: ${details.businessStatus || "unknown"})`
        );
      }
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        placeId: place.id,
        name: place.name,
        error: errorMsg,
      });
      console.error(
        `[check-closed] [${i + 1}/${toCheck.length}] FAILED "${place.name}" (id=${place.id}): ${errorMsg}`
      );
    }

    if (i < toCheck.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[check-closed] Done in ${elapsed}ms — ${checked} checked, ${newlyClosed} newly closed, ${failed} failed`
  );

  if (closedPlaces.length > 0) {
    console.warn(
      `[check-closed] Closed places:`,
      JSON.stringify(closedPlaces, null, 2)
    );
  }

  if (errors.length > 0) {
    console.warn(
      `[check-closed] Errors:`,
      JSON.stringify(errors, null, 2)
    );
  }

  return NextResponse.json({
    total: candidates.length,
    checked,
    newlyClosed,
    failed,
    closedPlaces: closedPlaces.length > 0 ? closedPlaces : undefined,
    errors: errors.length > 0 ? errors : undefined,
    elapsedMs: elapsed,
  });
}

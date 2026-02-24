import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places, placeRatings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { autocomplete, getPlaceDetails, mapGoogleDetailsToPlace } from "@/lib/google-places";
import { GOOGLE_TYPE_MAP } from "@/lib/types";
import { tasks } from "@trigger.dev/sdk";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { name, lat, lng, cityId, source } = await request.json();

  if (!name || lat == null || lng == null) {
    return NextResponse.json(
      { error: "name, lat, and lng are required" },
      { status: 400 }
    );
  }

  // 1. Find Google match via autocomplete
  const results = await autocomplete(name, { lat, lng });
  if (!results?.length) {
    return NextResponse.json({ matched: false });
  }

  const placeId = results[0].placePrediction?.placeId;
  if (!placeId) {
    return NextResponse.json({ matched: false });
  }

  // 2. Get full details from Google
  const details = await getPlaceDetails(placeId);
  const mapped = mapGoogleDetailsToPlace(details);

  // 3. Check for duplicate googlePlaceId
  const [existing] = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(eq(places.googlePlaceId, mapped.googlePlaceId));

  if (existing) {
    return NextResponse.json({
      matched: true,
      duplicate: true,
      existingName: existing.name,
    });
  }

  // 4. Derive place type from Google types
  let placeType: string | null = null;
  for (const t of mapped.types) {
    if (GOOGLE_TYPE_MAP[t]) {
      placeType = GOOGLE_TYPE_MAP[t];
      break;
    }
  }

  // 5. Insert place
  const [newPlace] = await db
    .insert(places)
    .values({
      name: mapped.name,
      address: mapped.address,
      lat: mapped.lat,
      lng: mapped.lng,
      cityId: cityId || null,
      neighborhood: mapped.neighborhood,
      placeType,
      cuisineType: mapped.cuisineTypes.length > 0 ? mapped.cuisineTypes : null,
      priceRange: mapped.priceRange,
      websiteUrl: mapped.websiteUrl,
      phone: mapped.phone,
      googlePlaceId: mapped.googlePlaceId,
      hoursJson: mapped.hoursJson,
      source: source || null,
      beenThere: false,
      archived: false,
    })
    .returning();

  // 6. Save Google rating
  if (mapped.googleRating) {
    await db.insert(placeRatings).values({
      placeId: newPlace.id,
      source: "google",
      rating: mapped.googleRating,
      ratingMax: 5,
      reviewCount: mapped.googleRatingCount || null,
      lastFetched: new Date(),
    });
  }

  // 7. Trigger coverage scraping
  try {
    await tasks.trigger("initiate-coverage", { placeId: newPlace.id });
  } catch (err) {
    console.error("[discover/add] Failed to trigger initiate-coverage:", err);
  }

  return NextResponse.json({
    matched: true,
    duplicate: false,
    place: newPlace,
  });
}

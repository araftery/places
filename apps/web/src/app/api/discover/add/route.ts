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

  console.log(`[discover/add] Looking up "${name}" near (${lat}, ${lng}), cityId=${cityId}, source="${source}"`);

  // 1. Find Google match via autocomplete
  const results = await autocomplete(name, { lat, lng });
  if (!results?.length) {
    console.warn(`[discover/add] No autocomplete results for "${name}" near (${lat}, ${lng})`);
    return NextResponse.json({ matched: false });
  }

  const topResults = results.slice(0, 3).map((r) => ({
    placeId: r.placePrediction?.placeId,
    name: r.placePrediction?.structuredFormat?.mainText?.text ?? r.placePrediction?.text?.text ?? "unknown",
  }));
  console.log(`[discover/add] Autocomplete returned ${results.length} results. Top: ${JSON.stringify(topResults)}`);

  const placeId = results[0].placePrediction?.placeId;
  if (!placeId) {
    console.warn(`[discover/add] First autocomplete result for "${name}" has no placeId`);
    return NextResponse.json({ matched: false });
  }

  // 2. Get full details from Google
  const details = await getPlaceDetails(placeId);
  const mapped = mapGoogleDetailsToPlace(details);
  console.log(`[discover/add] Google match: "${mapped.name}" at (${mapped.lat}, ${mapped.lng}), googlePlaceId=${mapped.googlePlaceId}, types=${mapped.types.join(",")}`);


  // 3. Check for duplicate googlePlaceId
  const [existing] = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(eq(places.googlePlaceId, mapped.googlePlaceId));

  if (existing) {
    console.log(`[discover/add] Duplicate: "${name}" matched existing place #${existing.id} "${existing.name}"`);
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

  console.log(`[discover/add] Created place #${newPlace.id} "${newPlace.name}" (type=${placeType}, neighborhood=${mapped.neighborhood})`);

  return NextResponse.json({
    matched: true,
    duplicate: false,
    place: newPlace,
  });
}

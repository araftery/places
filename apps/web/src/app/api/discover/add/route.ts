import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places, placeRatings, cities as citiesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { autocomplete, getPlaceDetails, mapGoogleDetailsToPlace } from "@/lib/google-places";
import { GOOGLE_TO_DEFAULT_PLACE_TYPE } from "@/lib/types";
import { tasks } from "@trigger.dev/sdk";

export const dynamic = "force-dynamic";

const MAX_DISTANCE_METERS = 200;

/** Haversine distance in meters between two lat/lng points */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: NextRequest) {
  const { name, lat, lng, cityId, source, reviewSlug } = await request.json();

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

  // 2. Get details for top candidates and pick the closest within 200m
  const candidates = results.slice(0, 3).filter((r) => r.placePrediction?.placeId);
  let mapped: ReturnType<typeof mapGoogleDetailsToPlace> | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const details = await getPlaceDetails(candidate.placePrediction.placeId);
    const candidateMapped = mapGoogleDetailsToPlace(details);
    const dist = haversineMeters(lat, lng, candidateMapped.lat, candidateMapped.lng);
    console.log(`[discover/add] Candidate "${candidateMapped.name}" at (${candidateMapped.lat}, ${candidateMapped.lng}), distance=${Math.round(dist)}m`);
    if (dist <= MAX_DISTANCE_METERS && dist < bestDist) {
      mapped = candidateMapped;
      bestDist = dist;
    }
  }

  if (!mapped) {
    console.warn(`[discover/add] No Google result within ${MAX_DISTANCE_METERS}m for "${name}" near (${lat}, ${lng})`);
    return NextResponse.json({ matched: false });
  }

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
  if (mapped.googlePlaceType && GOOGLE_TO_DEFAULT_PLACE_TYPE[mapped.googlePlaceType]) {
    placeType = GOOGLE_TO_DEFAULT_PLACE_TYPE[mapped.googlePlaceType];
  } else {
    for (const t of mapped.types) {
      if (GOOGLE_TO_DEFAULT_PLACE_TYPE[t]) {
        placeType = GOOGLE_TO_DEFAULT_PLACE_TYPE[t];
        break;
      }
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
      googlePlaceType: mapped.googlePlaceType,
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
  const ratings = [];
  if (mapped.googleRating) {
    const [googleRating] = await db.insert(placeRatings).values({
      placeId: newPlace.id,
      source: "google",
      rating: mapped.googleRating,
      ratingMax: 5,
      reviewCount: mapped.googleRatingCount || null,
      lastFetched: new Date(),
    }).returning();
    ratings.push(googleRating);
  }

  // 7. Save Infatuation review slug so discover matching works immediately
  if (reviewSlug) {
    const [infatuationRating] = await db.insert(placeRatings).values({
      placeId: newPlace.id,
      source: "infatuation",
      externalId: reviewSlug,
      lastFetched: new Date(),
    }).returning();
    ratings.push(infatuationRating);
  }

  // 8. Trigger coverage scraping
  try {
    await tasks.trigger("initiate-coverage", { placeId: newPlace.id });
  } catch (err) {
    console.error("[discover/add] Failed to trigger initiate-coverage:", err);
  }

  // Look up city name for the response
  let cityName: string | null = null;
  if (newPlace.cityId) {
    const [city] = await db
      .select({ name: citiesTable.name })
      .from(citiesTable)
      .where(eq(citiesTable.id, newPlace.cityId));
    if (city) cityName = city.name;
  }

  console.log(`[discover/add] Created place #${newPlace.id} "${newPlace.name}" (type=${placeType}, neighborhood=${mapped.neighborhood})`);

  return NextResponse.json({
    matched: true,
    duplicate: false,
    place: {
      ...newPlace,
      cityName,
      tags: [],
      cuisines: [],
      ratings,
    },
  });
}

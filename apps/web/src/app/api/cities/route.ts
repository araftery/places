import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createInfatuationClient } from "@places/clients/infatuation";

export const dynamic = "force-dynamic";

export async function GET() {
  const allCities = await db.select().from(cities);
  return NextResponse.json(allCities);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, country, placeLat, placeLng } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const countryCode = country || "US";

  // Check for existing city
  const [existing] = await db
    .select()
    .from(cities)
    .where(and(eq(cities.name, name.trim()), eq(cities.country, countryCode)));

  // Check that the city isn't too far from the place
  function checkDistance(cityLat: number, cityLng: number, cityName: string) {
    if (placeLat == null || placeLng == null) return null;
    const dLat = placeLat - cityLat;
    const dLng = placeLng - cityLng;
    const distMiles = Math.sqrt(dLat * dLat + dLng * dLng) * 69; // 1 degree ≈ 69 miles
    if (distMiles > 50) {
      return `"${cityName}" is ~${Math.round(distMiles)} miles from the selected place`;
    }
    return null;
  }

  if (existing) {
    const tooFar = checkDistance(existing.lat, existing.lng, existing.name);
    if (tooFar) {
      return NextResponse.json({ error: tooFar }, { status: 400 });
    }
    return NextResponse.json({ ...existing, existing: true }, { status: 200 });
  }

  // Geocode via Google
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    `${name}, ${countryCode}`
  )}&key=${process.env.GOOGLE_PLACES_API_KEY}`;

  const geocodeRes = await fetch(geocodeUrl);
  const geocodeData = await geocodeRes.json();
  const result = geocodeData.results?.[0];
  const location = result?.geometry?.location;

  if (!location) {
    return NextResponse.json(
      { error: "Could not geocode city" },
      { status: 400 }
    );
  }

  // Extract the canonical city name from Google's address components
  const addressComponents = result.address_components ?? [];
  const localityComp = addressComponents.find(
    (c: { types: string[] }) => c.types.includes("locality")
  );
  const geocodedName: string | null = localityComp?.long_name ?? null;

  const tooFar = checkDistance(location.lat, location.lng, geocodedName || name.trim());
  if (tooFar) {
    return NextResponse.json({ error: tooFar }, { status: 400 });
  }

  // Find Infatuation slug
  let infatuationSlug: string | null = null;
  const providers: string[] = ["google", "beli"];

  try {
    const infClient = createInfatuationClient();
    const infCities = await infClient.listCities();
    const match = infCities.find(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (match) {
      infatuationSlug = match.slug;
      providers.push("infatuation");
    }
  } catch {
    // Infatuation lookup is best-effort
  }

  const [newCity] = await db
    .insert(cities)
    .values({
      name: name.trim(),
      country: countryCode,
      lat: location.lat,
      lng: location.lng,
      providers,
      infatuationSlug,
    })
    .returning();

  return NextResponse.json({ ...newCity, geocodedName }, { status: 201 });
}

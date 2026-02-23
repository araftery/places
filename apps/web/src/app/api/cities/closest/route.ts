import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cities } from "@/db/schema";

export const dynamic = "force-dynamic";

const MAX_DISTANCE_KM = 50;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  const placeLat = parseFloat(lat);
  const placeLng = parseFloat(lng);

  const allCities = await db.select().from(cities);

  let closest: { city: typeof allCities[number]; distance: number } | null =
    null;

  for (const city of allCities) {
    const dist = haversineKm(placeLat, placeLng, city.lat, city.lng);
    if (!closest || dist < closest.distance) {
      closest = { city, distance: dist };
    }
  }

  if (!closest || closest.distance > MAX_DISTANCE_KM) {
    return NextResponse.json({ city: null, distance: null });
  }

  return NextResponse.json({
    city: closest.city,
    distance: Math.round(closest.distance * 10) / 10,
  });
}

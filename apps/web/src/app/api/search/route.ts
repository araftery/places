import { NextRequest, NextResponse } from "next/server";
import { autocomplete, getPlaceDetails, mapGoogleDetailsToPlace } from "@/lib/google-places";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const allTypes = searchParams.get("allTypes") === "1";

  if (!input) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }

  const locationBias =
    lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined;

  const suggestions = await autocomplete(input, locationBias, { allTypes });
  return NextResponse.json(suggestions);
}

export async function POST(request: NextRequest) {
  const { placeId } = await request.json();

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const details = await getPlaceDetails(placeId);
  return NextResponse.json(mapGoogleDetailsToPlace(details));
}

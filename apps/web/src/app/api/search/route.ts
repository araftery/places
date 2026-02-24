import { NextRequest, NextResponse } from "next/server";
import { autocomplete, getPlaceDetails, mapPriceLevel } from "@/lib/google-places";

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

  // Extract neighborhood and city from address components
  const components = details.addressComponents || [];
  const neighborhood =
    components.find((c) => c.types.includes("neighborhood"))?.longText || null;
  const sublocality =
    components.find((c) => c.types.includes("sublocality"))?.longText || null;
  const locality =
    components.find((c) => c.types.includes("locality"))?.longText || null;
  const postalTown =
    components.find((c) => c.types.includes("postal_town"))?.longText || null;
  const adminLevel1 =
    components.find((c) => c.types.includes("administrative_area_level_1"))?.longText || null;
  // For cities with boroughs (e.g. NYC), there's no locality — use the
  // state/region name which for NYC is "New York". Only apply this when a
  // sublocality exists (signals a borough-style address).
  const city = locality || postalTown || (sublocality ? adminLevel1 : null) || null;

  // Derive cuisine hints from Google types
  const cuisineTypes = (details.types || [])
    .filter(
      (t) =>
        t.endsWith("_restaurant") ||
        ["italian_restaurant", "japanese_restaurant", "mexican_restaurant",
         "chinese_restaurant", "indian_restaurant", "thai_restaurant",
         "french_restaurant", "korean_restaurant", "vietnamese_restaurant",
         "mediterranean_restaurant", "greek_restaurant", "spanish_restaurant",
         "american_restaurant", "seafood_restaurant", "pizza_restaurant",
         "sushi_restaurant", "steak_house", "barbecue_restaurant",
         "ramen_restaurant", "brunch_restaurant", "vegetarian_restaurant",
         "vegan_restaurant"].includes(t)
    )
    .map((t) =>
      t
        .replace("_restaurant", "")
        .replace("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );

  return NextResponse.json({
    googlePlaceId: details.id,
    name: details.displayName.text,
    address: details.formattedAddress,
    lat: details.location.latitude,
    lng: details.location.longitude,
    websiteUrl: details.websiteUri || null,
    phone: details.nationalPhoneNumber || null,
    priceRange: mapPriceLevel(details.priceLevel),
    hoursJson: details.regularOpeningHours || null,
    googleRating: details.rating || null,
    googleRatingCount: details.userRatingCount || null,
    primaryType: details.primaryType || null,
    types: details.types || [],
    neighborhood: neighborhood || sublocality || null,
    city,
    cuisineTypes,
  });
}

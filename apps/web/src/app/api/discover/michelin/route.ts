import { NextRequest, NextResponse } from "next/server";
import { createMichelinClient } from "@places/clients";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const citySlugs = searchParams.get("citySlugs");
  const distinction = searchParams.get("distinction") || undefined;
  const page = parseInt(searchParams.get("page") || "0", 10);

  if (!citySlugs) {
    return NextResponse.json(
      { error: "citySlugs is required" },
      { status: 400 }
    );
  }

  const slugsArray = citySlugs.split(",").filter(Boolean);

  const client = createMichelinClient();
  const result = await client.listRestaurants(slugsArray, {
    distinction,
    page,
    hitsPerPage: 20,
  });

  return NextResponse.json(result);
}

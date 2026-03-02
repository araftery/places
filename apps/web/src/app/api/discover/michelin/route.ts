import { NextRequest, NextResponse } from "next/server";
import { createMichelinClient } from "@places/clients";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const citySlug = searchParams.get("citySlug");
  const distinction = searchParams.get("distinction") || undefined;
  const page = parseInt(searchParams.get("page") || "0", 10);

  if (!citySlug) {
    return NextResponse.json(
      { error: "citySlug is required" },
      { status: 400 }
    );
  }

  const client = createMichelinClient();
  const result = await client.listRestaurants(citySlug, {
    distinction,
    page,
    hitsPerPage: 20,
  });

  return NextResponse.json(result);
}

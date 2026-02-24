import { NextRequest, NextResponse } from "next/server";
import { createInfatuationClient } from "@places/clients/infatuation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const citySlug = searchParams.get("citySlug");

  if (!citySlug) {
    return NextResponse.json({ error: "citySlug is required" }, { status: 400 });
  }

  const client = createInfatuationClient();
  const guides = await client.listGuides(citySlug);
  return NextResponse.json(guides);
}

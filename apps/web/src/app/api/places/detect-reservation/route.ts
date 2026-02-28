import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places } from "@/db/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { placeId } = await req.json();
  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  const [place] = await db.select().from(places).where(eq(places.id, placeId));
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  try {
    await tasks.trigger("detect-reservation", {
      placeId: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      websiteUrl: place.websiteUrl,
    });
    return NextResponse.json({ triggered: true });
  } catch (err) {
    console.error("Failed to trigger detect-reservation:", err);
    return NextResponse.json({ error: "Failed to trigger job" }, { status: 500 });
  }
}

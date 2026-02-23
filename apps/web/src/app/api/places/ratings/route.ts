import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { placeRatings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { placeId, source, rating, notes, ratingUrl } = body;

  if (!placeId || !source) {
    return NextResponse.json(
      { error: "placeId and source are required" },
      { status: 400 }
    );
  }

  const [newRating] = await db
    .insert(placeRatings)
    .values({
      placeId,
      source,
      rating: rating || null,
      notes: notes || null,
      ratingUrl: ratingUrl || null,
      lastFetched: new Date(),
    })
    .returning();

  return NextResponse.json(newRating, { status: 201 });
}

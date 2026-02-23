import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { placeRatings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { placeId, source, rating, ratingMax, notes, reviewCount, ratingUrl } = body;

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
      rating: rating ?? null,
      ratingMax: ratingMax ?? null,
      notes: notes || null,
      reviewCount: reviewCount ?? null,
      ratingUrl: ratingUrl || null,
      lastFetched: new Date(),
    })
    .returning();

  return NextResponse.json(newRating, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { places, placeTags, placeRatings, tags, cities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";

export const dynamic = "force-dynamic";

export async function GET() {
  const allPlaces = await db.select().from(places);

  const allPlaceTags = await db
    .select({
      placeId: placeTags.placeId,
      tagId: placeTags.tagId,
      tagName: tags.name,
      tagColor: tags.color,
    })
    .from(placeTags)
    .innerJoin(tags, eq(placeTags.tagId, tags.id));

  const allRatings = await db.select().from(placeRatings);

  // Fetch cities for joining
  const allCities = await db.select().from(cities);
  const cityMap = new Map(allCities.map((c) => [c.id, c]));

  const tagsByPlace = new Map<number, Array<{ id: number; name: string; color: string }>>();
  for (const pt of allPlaceTags) {
    const arr = tagsByPlace.get(pt.placeId) || [];
    arr.push({ id: pt.tagId, name: pt.tagName, color: pt.tagColor });
    tagsByPlace.set(pt.placeId, arr);
  }

  const ratingsByPlace = new Map<number, typeof allRatings>();
  for (const r of allRatings) {
    const arr = ratingsByPlace.get(r.placeId) || [];
    arr.push(r);
    ratingsByPlace.set(r.placeId, arr);
  }

  const result = allPlaces.map((p) => ({
    ...p,
    cityName: p.cityId ? (cityMap.get(p.cityId)?.name ?? null) : null,
    tags: tagsByPlace.get(p.id) || [],
    ratings: ratingsByPlace.get(p.id) || [],
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    tagIds,
    googleRating,
    googleRatingCount,
    ...placeData
  } = body;

  const [newPlace] = await db.insert(places).values(placeData).returning();

  if (tagIds && tagIds.length > 0) {
    await db.insert(placeTags).values(
      tagIds.map((tagId: number) => ({
        placeId: newPlace.id,
        tagId,
      }))
    );
  }

  if (googleRating) {
    await db.insert(placeRatings).values({
      placeId: newPlace.id,
      source: "google",
      rating: googleRating,
      ratingMax: 5,
      reviewCount: googleRatingCount || null,
      lastFetched: new Date(),
    });
  }

  // Fire-and-forget: trigger async coverage scraping
  try {
    await tasks.trigger("initiate-coverage", { placeId: newPlace.id });
  } catch (err) {
    // Don't fail place creation if trigger fails
    console.error("[places/POST] Failed to trigger initiate-coverage:", err);
  }

  return NextResponse.json(newPlace, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, tagIds, ...updateData } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(places)
    .set(updateData)
    .where(eq(places.id, id))
    .returning();

  if (tagIds !== undefined) {
    await db.delete(placeTags).where(eq(placeTags.placeId, id));
    if (tagIds.length > 0) {
      await db.insert(placeTags).values(
        tagIds.map((tagId: number) => ({
          placeId: id,
          tagId,
        }))
      );
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db.delete(places).where(eq(places.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

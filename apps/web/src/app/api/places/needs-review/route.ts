import { NextResponse } from "next/server";
import { db } from "@/db";
import { places, placeTags, tags, cities } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

const STALE_MONTHS = 6;

export async function GET() {
  const staleDate = new Date();
  staleDate.setMonth(staleDate.getMonth() - STALE_MONTHS);

  // Permanently closed places that haven't been archived yet
  const closedPlaces = await db
    .select()
    .from(places)
    .where(
      and(
        eq(places.closedPermanently, true),
        eq(places.archived, false)
      )
    );

  // Stale places: want_to_try, added more than 6 months ago
  const stalePlaces = await db
    .select()
    .from(places)
    .where(
      and(
        eq(places.beenThere, false),
        eq(places.archived, false),
        lt(places.createdAt, staleDate)
      )
    );

  // Fetch tags for these places
  const placeIds = [
    ...closedPlaces.map((p) => p.id),
    ...stalePlaces.map((p) => p.id),
  ];

  const placeTags2 = placeIds.length > 0
    ? await db
        .select({
          placeId: placeTags.placeId,
          tagId: placeTags.tagId,
          tagName: tags.name,
          tagColor: tags.color,
        })
        .from(placeTags)
        .innerJoin(tags, eq(placeTags.tagId, tags.id))
    : [];

  // Fetch cities for joining
  const allCities = await db.select().from(cities);
  const cityMap = new Map(allCities.map((c) => [c.id, c]));

  const tagsByPlace = new Map<
    number,
    Array<{ id: number; name: string; color: string }>
  >();
  for (const pt of placeTags2) {
    if (!placeIds.includes(pt.placeId)) continue;
    const arr = tagsByPlace.get(pt.placeId) || [];
    arr.push({ id: pt.tagId, name: pt.tagName, color: pt.tagColor });
    tagsByPlace.set(pt.placeId, arr);
  }

  const addTags = (p: typeof closedPlaces[number]) => ({
    ...p,
    cityName: p.cityId ? (cityMap.get(p.cityId)?.name ?? null) : null,
    tags: tagsByPlace.get(p.id) || [],
    ratings: [],
  });

  return NextResponse.json({
    closed: closedPlaces.map(addTags),
    stale: stalePlaces
      .filter((p) => !closedPlaces.some((c) => c.id === p.id))
      .map(addTags),
  });
}

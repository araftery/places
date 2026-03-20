import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { placeTags } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { placeId, tagId } = body;
  if (!placeId || !tagId) {
    return NextResponse.json(
      { error: "placeId and tagId are required" },
      { status: 400 }
    );
  }
  await db
    .insert(placeTags)
    .values({ placeId, tagId })
    .onConflictDoNothing();
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { placeId, tagId } = body;
  if (!placeId || !tagId) {
    return NextResponse.json(
      { error: "placeId and tagId are required" },
      { status: 400 }
    );
  }
  await db
    .delete(placeTags)
    .where(and(eq(placeTags.placeId, placeId), eq(placeTags.tagId, tagId)));
  return NextResponse.json({ success: true });
}

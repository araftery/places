import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { placeLists } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { placeId, listId } = body;
  if (!placeId || !listId) {
    return NextResponse.json(
      { error: "placeId and listId are required" },
      { status: 400 }
    );
  }
  await db
    .insert(placeLists)
    .values({ placeId, listId })
    .onConflictDoNothing();
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { placeId, listId } = body;
  if (!placeId || !listId) {
    return NextResponse.json(
      { error: "placeId and listId are required" },
      { status: 400 }
    );
  }
  await db
    .delete(placeLists)
    .where(and(eq(placeLists.placeId, placeId), eq(placeLists.listId, listId)));
  return NextResponse.json({ success: true });
}

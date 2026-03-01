import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allLists = await db.select().from(lists);
  return NextResponse.json(allLists);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const [newList] = await db
    .insert(lists)
    .values({ name: body.name })
    .returning();
  return NextResponse.json(newList, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updateData } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const [updated] = await db
    .update(lists)
    .set(updateData)
    .where(eq(lists.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await db.delete(lists).where(eq(lists.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

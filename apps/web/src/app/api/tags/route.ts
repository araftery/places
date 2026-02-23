import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allTags = await db.select().from(tags);
  return NextResponse.json(allTags);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const [newTag] = await db
    .insert(tags)
    .values({ name: body.name, color: body.color || "#3b82f6" })
    .returning();
  return NextResponse.json(newTag, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updateData } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const [updated] = await db
    .update(tags)
    .set(updateData)
    .where(eq(tags.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await db.delete(tags).where(eq(tags.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

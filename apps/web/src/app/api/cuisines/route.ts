import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cuisines } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allCuisines = await db
    .select()
    .from(cuisines)
    .orderBy(asc(cuisines.name));

  return NextResponse.json(allCuisines);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [newCuisine] = await db
    .insert(cuisines)
    .values({ name: name.trim() })
    .returning();

  return NextResponse.json(newCuisine, { status: 201 });
}

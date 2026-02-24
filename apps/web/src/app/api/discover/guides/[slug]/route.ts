import { NextRequest, NextResponse } from "next/server";
import { createInfatuationClient } from "@places/clients/infatuation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const client = createInfatuationClient();
  const guide = await client.getGuideContent(slug);
  return NextResponse.json(guide);
}

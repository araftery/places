import { NextRequest, NextResponse } from "next/server";
import { getIsochrones, TransportMode } from "@/lib/traveltime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { lat, lng, mode, minutesList } = await request.json();

  if (!lat || !lng || !mode || !minutesList?.length) {
    return NextResponse.json(
      { error: "lat, lng, mode, and minutesList are required" },
      { status: 400 }
    );
  }

  const results = await getIsochrones(
    lat,
    lng,
    mode as TransportMode,
    minutesList
  );

  // Colors by ring position: outer → middle → inner
  const RING_COLORS = ["#5a7a5e", "#c47d2e", "#b5543b"];

  // Convert to GeoJSON, ordered largest-to-smallest so outer rings render behind inner
  const sortedMinutes = [...minutesList].sort((a: number, b: number) => b - a);
  const features = sortedMinutes.flatMap((minutes: number, index: number) => {
    const result = results.find((r) => r.search_id === `iso-${minutes}`);
    if (!result) return [];
    return result.shapes.map((shape) => ({
      type: "Feature" as const,
      properties: { minutes, color: RING_COLORS[index] },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          shape.shell.map((p) => [p.lng, p.lat]),
          ...shape.holes.map((hole) => hole.map((p) => [p.lng, p.lat])),
        ],
      },
    }));
  });

  return NextResponse.json({
    type: "FeatureCollection",
    features,
  });
}

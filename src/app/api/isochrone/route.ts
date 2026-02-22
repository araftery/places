import { NextRequest, NextResponse } from "next/server";
import { getIsochrone, TransportMode } from "@/lib/traveltime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { lat, lng, mode, minutes } = await request.json();

  if (!lat || !lng || !mode || !minutes) {
    return NextResponse.json(
      { error: "lat, lng, mode, and minutes are required" },
      { status: 400 }
    );
  }

  const result = await getIsochrone(
    lat,
    lng,
    mode as TransportMode,
    minutes
  );

  // Convert to GeoJSON polygon for Mapbox
  const features = result.shapes.map((shape) => ({
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        shape.shell.map((p) => [p.lng, p.lat]),
        ...shape.holes.map((hole) => hole.map((p) => [p.lng, p.lat])),
      ],
    },
  }));

  return NextResponse.json({
    type: "FeatureCollection",
    features,
  });
}

import { NextRequest, NextResponse } from "next/server";
import {
  getIsochrones,
  getMixedIsochrones,
  TransportMode,
} from "@/lib/traveltime";

export const dynamic = "force-dynamic";

// Mixed mode colors: inner → outer (walk 10, transit 10, transit 20)
const MIXED_COLORS = ["#5a7a5e", "#c47d2e", "#b5543b"];

export async function POST(request: NextRequest) {
  const { lat, lng, mode, minutesList } = await request.json();

  if (!lat || !lng || !mode) {
    return NextResponse.json(
      { error: "lat, lng, and mode are required" },
      { status: 400 }
    );
  }

  if (mode === "mixed") {
    const mixedResults = await getMixedIsochrones(lat, lng);

    // Order largest-to-smallest so outer rings render behind inner
    const reversed = [...mixedResults].reverse();
    const features = reversed.flatMap((entry, index) => {
      const colorIndex = reversed.length - 1 - index; // map back to inner→outer color order
      return entry.result.shapes.map((shape) => ({
        type: "Feature" as const,
        properties: {
          minutes: entry.band.minutes,
          color: MIXED_COLORS[colorIndex],
          mode: entry.band.mode,
          label: entry.band.label,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            shape.shell.map((p: { lat: number; lng: number }) => [
              p.lng,
              p.lat,
            ]),
            ...shape.holes.map(
              (hole: Array<{ lat: number; lng: number }>) =>
                hole.map((p) => [p.lng, p.lat])
            ),
          ],
        },
      }));
    });

    return NextResponse.json({ type: "FeatureCollection", features });
  }

  // Standard single-mode isochrone
  if (!minutesList?.length) {
    return NextResponse.json(
      { error: "minutesList is required for single-mode" },
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

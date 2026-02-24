/**
 * Shared geometry helpers for isochrone point-in-polygon and travel time band checks.
 */

export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: number[][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1],
      yi = polygon[i][0];
    const xj = polygon[j][1],
      yj = polygon[j][0];
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInIsochrone(
  lat: number,
  lng: number,
  geoJson: GeoJSON.FeatureCollection
): boolean {
  for (const feature of geoJson.features) {
    if (feature.geometry.type === "Polygon") {
      const coords = feature.geometry.coordinates[0] as number[][];
      if (isPointInPolygon(lat, lng, coords)) return true;
    }
  }
  return false;
}

export interface TravelTimeBand {
  minutes: number;
  color: string;
}

export function getTravelTimeBand(
  lat: number,
  lng: number,
  geoJson: GeoJSON.FeatureCollection
): TravelTimeBand | null {
  let best: TravelTimeBand | null = null;
  for (const feature of geoJson.features) {
    const props = feature.properties as { minutes: number; color: string } | null;
    if (!props) continue;
    if (feature.geometry.type === "Polygon") {
      const coords = feature.geometry.coordinates[0] as number[][];
      if (isPointInPolygon(lat, lng, coords)) {
        if (!best || props.minutes < best.minutes) {
          best = { minutes: props.minutes, color: props.color };
        }
      }
    }
  }
  return best;
}

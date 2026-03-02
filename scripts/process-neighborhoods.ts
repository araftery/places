/**
 * Download and process neighborhood boundaries for multiple cities.
 * Outputs simplified GeoJSON FeatureCollections to apps/web/public/neighborhoods/{slug}.json.
 *
 * Usage: pnpm tsx scripts/process-neighborhoods.ts
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const OUTPUT_DIR = resolve(__dirname, "../apps/web/public/neighborhoods");

// ── City sources ──────────────────────────────────────────────────────────────

interface CitySource {
  slug: string;
  url: string;
  /** Property key that holds the neighborhood name */
  nameProperty: string;
  /** Optional filter predicate on raw features */
  filter?: (f: GeoJSON.Feature) => boolean;
  /** Optional transform on the extracted name */
  transformName?: (name: string) => string;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CITY_SOURCES: CitySource[] = [
  {
    slug: "new-york",
    url: "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=300",
    nameProperty: "ntaname",
    filter: (f) => f.properties?.ntatype === "0", // residential only
  },
  {
    slug: "los-angeles",
    url: "https://raw.githubusercontent.com/blackmad/neighborhoods/master/los-angeles.geojson",
    nameProperty: "name",
  },
  {
    slug: "paris",
    url: "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson",
    nameProperty: "l_aroff",
  },
  {
    slug: "london",
    url: "https://raw.githubusercontent.com/radoi90/housequest-data/master/london_boroughs.geojson",
    nameProperty: "name",
  },
  {
    slug: "boston",
    url: "https://data.boston.gov/dataset/bf1a7b50-4c72-4637-b0fa-11d632e3aff1/resource/e5849875-a6f6-4c9c-9d8a-5048b0fbd03e/download/boston_neighborhood_boundaries.geojson",
    nameProperty: "name",
  },
  {
    slug: "chicago",
    url: "https://raw.githubusercontent.com/RandomFractals/ChicagoCrimes/master/data/chicago-community-areas.geojson",
    nameProperty: "community",
    transformName: titleCase, // source is ALL CAPS
  },
  {
    slug: "washington",
    url: "https://raw.githubusercontent.com/benbalter/dc-maps/master/maps/neighborhood-clusters.geojson",
    nameProperty: "NBH_NAMES",
    transformName: (s) => s.split(",")[0].trim(), // take first neighborhood from cluster
  },
  {
    slug: "san-francisco",
    url: "https://raw.githubusercontent.com/blackmad/neighborhoods/master/san-francisco.geojson",
    nameProperty: "name",
  },
];

// ── Geometry simplification ───────────────────────────────────────────────────

function simplifyRing(
  coords: [number, number][],
  tolerance: number
): [number, number][] {
  if (coords.length <= 4) return coords;

  function perpendicularDistance(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number]
  ): number {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0)
      return Math.sqrt(
        (point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2
      );
    const u =
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
      (mag * mag);
    const closestX = lineStart[0] + u * dx;
    const closestY = lineStart[1] + u * dy;
    return Math.sqrt(
      (point[0] - closestX) ** 2 + (point[1] - closestY) ** 2
    );
  }

  function douglasPeucker(
    points: [number, number][],
    tol: number
  ): [number, number][] {
    let maxDist = 0;
    let maxIndex = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }

    if (maxDist > tol) {
      const left = douglasPeucker(points.slice(0, maxIndex + 1), tol);
      const right = douglasPeucker(points.slice(maxIndex), tol);
      return [...left.slice(0, -1), ...right];
    }

    return [points[0], points[end]];
  }

  const simplified = douglasPeucker(coords, tolerance);
  if (
    simplified[0][0] !== simplified[simplified.length - 1][0] ||
    simplified[0][1] !== simplified[simplified.length - 1][1]
  ) {
    simplified.push(simplified[0]);
  }
  if (simplified.length < 4) return coords;
  return simplified;
}

function simplifyPolygon(
  rings: [number, number][][],
  tolerance: number
): [number, number][][] {
  return rings.map((ring) => simplifyRing(ring, tolerance));
}

function simplifyGeometry(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  tolerance: number
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: simplifyPolygon(
        geom.coordinates as [number, number][][],
        tolerance
      ),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: (geom.coordinates as [number, number][][][]).map((polygon) =>
      simplifyPolygon(polygon, tolerance)
    ),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TOLERANCE = 0.0002; // ~20m

async function processCity(source: CitySource) {
  console.log(`\n[${source.slug}] Downloading...`);
  const res = await fetch(source.url);
  if (!res.ok) {
    console.error(`  FAILED: HTTP ${res.status}`);
    return false;
  }

  const data = (await res.json()) as GeoJSON.FeatureCollection;
  console.log(`  Fetched ${data.features.length} features`);

  let features = data.features;
  if (source.filter) {
    features = features.filter(source.filter);
    console.log(`  ${features.length} after filtering`);
  }

  const simplified: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: features
      .filter((f) => {
        const name = f.properties?.[source.nameProperty];
        return name && typeof name === "string" && name.trim().length > 0;
      })
      .map((f) => {
        let name = (f.properties![source.nameProperty] as string).trim();
        if (source.transformName) name = source.transformName(name);
        return {
          type: "Feature" as const,
          properties: { name },
          geometry: simplifyGeometry(
            f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
            TOLERANCE
          ),
        };
      }),
  };

  const json = JSON.stringify(simplified);
  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  const outPath = resolve(OUTPUT_DIR, `${source.slug}.json`);
  writeFileSync(outPath, json);
  console.log(`  ${simplified.features.length} neighborhoods, ${sizeMB} MB → ${outPath}`);
  return true;
}

async function main() {
  const targetSlug = process.argv[2]; // optional: process single city
  const sources = targetSlug
    ? CITY_SOURCES.filter((s) => s.slug === targetSlug)
    : CITY_SOURCES;

  if (sources.length === 0) {
    console.error(`Unknown city slug: ${targetSlug}`);
    console.error(`Available: ${CITY_SOURCES.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }

  let failed = 0;
  for (const source of sources) {
    const ok = await processCity(source);
    if (!ok) failed++;
  }

  console.log(`\nDone! ${sources.length - failed}/${sources.length} succeeded.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

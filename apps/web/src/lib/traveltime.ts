const APP_ID = process.env.TRAVELTIME_APP_ID!;
const API_KEY = process.env.TRAVELTIME_API_KEY!;
const BASE_URL = "https://api.traveltimeapp.com/v4";

export type TransportMode = "walking" | "public_transport" | "driving";
export type IsochroneMode = TransportMode | "mixed";

export interface IsochroneResult {
  search_id: string;
  shapes: Array<{
    shell: Array<{ lat: number; lng: number }>;
    holes: Array<Array<{ lat: number; lng: number }>>;
  }>;
}

export async function getIsochrones(
  lat: number,
  lng: number,
  mode: TransportMode,
  minutesList: number[]
): Promise<IsochroneResult[]> {
  const departureTime = new Date().toISOString();

  const body = {
    departure_searches: minutesList.map((minutes) => ({
      id: `iso-${minutes}`,
      coords: { lat, lng },
      departure_time: departureTime,
      travel_time: minutes * 60,
      transportation: {
        type: mode === "public_transport" ? "public_transport" : mode,
      },
    })),
  };

  const res = await fetch(`${BASE_URL}/time-map`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Application-Id": APP_ID,
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TravelTime API error: ${text}`);
  }

  const data = await res.json();
  return data.results;
}

export interface MixedBand {
  mode: TransportMode;
  minutes: number;
  label: string;
}

export const MIXED_BANDS: MixedBand[] = [
  { mode: "walking", minutes: 10, label: "walk" },
  { mode: "public_transport", minutes: 10, label: "transit" },
  { mode: "public_transport", minutes: 20, label: "transit" },
];

export interface MixedIsochroneResult {
  band: MixedBand;
  result: IsochroneResult;
}

export async function getMixedIsochrones(
  lat: number,
  lng: number
): Promise<MixedIsochroneResult[]> {
  // Group by mode to batch API calls
  const byMode = new Map<TransportMode, number[]>();
  for (const band of MIXED_BANDS) {
    const existing = byMode.get(band.mode) ?? [];
    existing.push(band.minutes);
    byMode.set(band.mode, existing);
  }

  const allResults = await Promise.all(
    Array.from(byMode.entries()).map(async ([mode, minutesList]) => {
      const results = await getIsochrones(lat, lng, mode, minutesList);
      return { mode, results };
    })
  );

  // Match results back to bands
  return MIXED_BANDS.map((band) => {
    const modeResults = allResults.find((r) => r.mode === band.mode);
    const result = modeResults?.results.find(
      (r) => r.search_id === `iso-${band.minutes}`
    );
    return { band, result: result! };
  }).filter((r) => r.result);
}

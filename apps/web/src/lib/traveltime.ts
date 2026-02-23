const APP_ID = process.env.TRAVELTIME_APP_ID!;
const API_KEY = process.env.TRAVELTIME_API_KEY!;
const BASE_URL = "https://api.traveltimeapp.com/v4";

export type TransportMode = "walking" | "public_transport" | "driving";

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

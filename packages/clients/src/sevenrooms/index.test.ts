import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSevenRoomsClient } from "./index";

// ── Helpers to build mock API responses ────────────────────────────

function makeSlot(
  time: string,
  timeIso: string,
  type: "book" | "request",
  opts?: { duration?: number }
) {
  return {
    sort_order: 1,
    time,
    time_iso: timeIso,
    type,
    ...(type === "book" ? { duration: opts?.duration ?? 90 } : {}),
    is_requestable: type === "request",
    access_persistent_id: type === "book" ? "abc" : null,
  };
}

function makeShift(
  name: string,
  category: string,
  times: ReturnType<typeof makeSlot>[],
  opts?: { isClosed?: boolean }
) {
  return {
    name,
    shift_persistent_id: "shift-1",
    shift_id: "shift-1",
    shift_category: category,
    is_closed: opts?.isClosed ?? false,
    times,
    upsell_categories: [],
  };
}

function apiResponse(availability: Record<string, ReturnType<typeof makeShift>[]>) {
  return { status: 200, data: { availability } };
}

function emptyApiResponse() {
  return apiResponse({});
}

// ── Mock fetch ─────────────────────────────────────────────────────

vi.mock("../proxy", () => ({
  createFetch: () => mockFetch,
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01"));
});

// ── Tests ──────────────────────────────────────────────────────────

describe("getAvailability", () => {
  it("parses bookable and request slots", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        apiResponse({
          "2026-03-02": [
            makeShift("Dinner", "DINNER", [
              makeSlot("5:30 PM", "2026-03-02 17:30:00", "book", { duration: 90 }),
              makeSlot("7:00 PM", "2026-03-02 19:00:00", "request"),
            ]),
          ],
        }),
    });

    const client = createSevenRoomsClient();
    const result = await client.getAvailability("test-venue", "2026-03-02", 2);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-03-02");
    expect(result[0].slots).toHaveLength(2);
    expect(result[0].slots[0]).toEqual({
      time: "5:30 PM",
      timeIso: "2026-03-02 17:30:00",
      type: "book",
      duration: 90,
      shiftCategory: "DINNER",
      shiftName: "Dinner",
    });
    expect(result[0].slots[1]).toEqual({
      time: "7:00 PM",
      timeIso: "2026-03-02 19:00:00",
      type: "request",
      duration: null,
      shiftCategory: "DINNER",
      shiftName: "Dinner",
    });
  });

  it("passes correct query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    await client.getAvailability("my-venue", "2026-03-10", 4, "20:00");

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get("venue")).toBe("my-venue");
    expect(url.searchParams.get("start_date")).toBe("2026-03-10");
    expect(url.searchParams.get("party_size")).toBe("4");
    expect(url.searchParams.get("time_slot")).toBe("20:00");
    expect(url.searchParams.get("num_days")).toBe("1");
    expect(url.searchParams.get("channel")).toBe("SEVENROOMS_WIDGET");
    expect(url.searchParams.get("halo_size_interval")).toBe("16");
  });

  it("defaults timeSlot to 19:00", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    await client.getAvailability("my-venue", "2026-03-10", 2);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get("time_slot")).toBe("19:00");
  });

  it("skips closed shifts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        apiResponse({
          "2026-03-02": [
            makeShift(
              "Closed Lunch",
              "LUNCH",
              [makeSlot("12:00 PM", "2026-03-02 12:00:00", "book")],
              { isClosed: true }
            ),
            makeShift("Dinner", "DINNER", [
              makeSlot("7:00 PM", "2026-03-02 19:00:00", "book"),
            ]),
          ],
        }),
    });

    const client = createSevenRoomsClient();
    const result = await client.getAvailability("test-venue", "2026-03-02", 2);

    expect(result[0].slots).toHaveLength(1);
    expect(result[0].slots[0].shiftName).toBe("Dinner");
  });

  it("returns sorted dates for multi-day response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        apiResponse({
          "2026-03-04": [
            makeShift("Dinner", "DINNER", [
              makeSlot("7:00 PM", "2026-03-04 19:00:00", "book"),
            ]),
          ],
          "2026-03-02": [
            makeShift("Dinner", "DINNER", [
              makeSlot("7:00 PM", "2026-03-02 19:00:00", "book"),
            ]),
          ],
          "2026-03-03": [
            makeShift("Dinner", "DINNER", [
              makeSlot("7:00 PM", "2026-03-03 19:00:00", "book"),
            ]),
          ],
        }),
    });

    const client = createSevenRoomsClient();
    const result = await client.getAvailability("test-venue", "2026-03-02", 2);

    expect(result.map((r) => r.date)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"msg":"invalid num_days"}',
    });

    const client = createSevenRoomsClient();
    await expect(
      client.getAvailability("test-venue", "2026-03-02", 2)
    ).rejects.toThrow("SevenRooms API error 400");
  });

  it("handles empty availability gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    const result = await client.getAvailability("test-venue", "2026-03-02", 2);
    expect(result).toEqual([]);
  });
});

describe("getOpeningWindow", () => {
  /** Helper: given a cutoff date, return a fetch mock that returns bookable
   * slots for dates on or before the cutoff, and empty for dates after. */
  function mockAvailabilityWithCutoff(cutoffDate: string) {
    return async (url: string) => {
      const u = new URL(url);
      const startDate = u.searchParams.get("start_date")!;
      const numDays = Number(u.searchParams.get("num_days"));

      const availability: Record<string, ReturnType<typeof makeShift>[]> = {};
      const start = new Date(startDate);

      for (let i = 0; i < numDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];

        if (dateStr <= cutoffDate) {
          availability[dateStr] = [
            makeShift("Dinner", "DINNER", [
              makeSlot("7:00 PM", `${dateStr} 19:00:00`, "book"),
            ]),
          ];
        }
      }

      return { ok: true, json: async () => apiResponse(availability) };
    };
  }

  it("finds a ~30 day opening window", async () => {
    // Cutoff at day 30 from today (2026-03-01 + 30 = 2026-03-31)
    mockFetch.mockImplementation(mockAvailabilityWithCutoff("2026-03-31"));

    const client = createSevenRoomsClient();
    const result = await client.getOpeningWindow("test-venue", 2);

    expect(result.lastAvailableDate).toBe("2026-03-31");
    expect(result.openingWindowDays).toBe(30);
  });

  it("finds a short opening window via near-term fallback", async () => {
    // Cutoff at day 5 — first jump at day 28 will miss, falls back to today probe
    mockFetch.mockImplementation(mockAvailabilityWithCutoff("2026-03-06"));

    const client = createSevenRoomsClient();
    const result = await client.getOpeningWindow("test-venue", 2);

    expect(result.lastAvailableDate).toBe("2026-03-06");
    expect(result.openingWindowDays).toBe(5);
  });

  it("returns null when no bookable slots exist at all", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    const result = await client.getOpeningWindow("test-venue", 2);

    expect(result.lastAvailableDate).toBeNull();
    expect(result.openingWindowDays).toBeNull();
  });

  it("ignores request-only slots when determining window", async () => {
    // Only request slots, no book slots
    mockFetch.mockImplementation(async (url: string) => {
      const u = new URL(url);
      const startDate = u.searchParams.get("start_date")!;
      const numDays = Number(u.searchParams.get("num_days"));

      const availability: Record<string, ReturnType<typeof makeShift>[]> = {};
      const start = new Date(startDate);

      for (let i = 0; i < numDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];

        availability[dateStr] = [
          makeShift("Dinner", "DINNER", [
            makeSlot("7:00 PM", `${dateStr} 19:00:00`, "request"),
          ]),
        ];
      }

      return { ok: true, json: async () => apiResponse(availability) };
    });

    const client = createSevenRoomsClient();
    const result = await client.getOpeningWindow("test-venue", 2);

    expect(result.lastAvailableDate).toBeNull();
    expect(result.openingWindowDays).toBeNull();
  });

  it("uses num_days=3 for probing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    await client.getOpeningWindow("test-venue", 2);

    for (const call of mockFetch.mock.calls) {
      const url = new URL(call[0]);
      expect(url.searchParams.get("num_days")).toBe("3");
    }
  });

  it("defaults partySize to 2", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyApiResponse(),
    });

    const client = createSevenRoomsClient();
    await client.getOpeningWindow("test-venue");

    for (const call of mockFetch.mock.calls) {
      const url = new URL(call[0]);
      expect(url.searchParams.get("party_size")).toBe("2");
    }
  });

  it("uses fewer API calls than a linear scan", async () => {
    // 30-day window: linear would need ~10+ calls stepping by 3
    mockFetch.mockImplementation(mockAvailabilityWithCutoff("2026-03-31"));

    const client = createSevenRoomsClient();
    await client.getOpeningWindow("test-venue", 2);

    // Jump phase: day 28 (hit) → day 56 (miss) = 2 calls
    // Binary search between 28-56: ~3-4 calls
    // Total should be well under 10
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(7);
  });
});

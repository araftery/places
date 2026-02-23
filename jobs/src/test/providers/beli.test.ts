import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    trace: vi.fn((_name: string, fn: (span: any) => any) =>
      fn({ setAttribute: vi.fn() })
    ),
  },
}));

const mockSearch = vi.fn();
const mockLookup = vi.fn();

vi.mock("../../utils/clients", () => ({
  getBeliClient: () => ({ search: mockSearch, lookup: mockLookup }),
}));

import { scrapeBeli } from "../../providers/beli";

const place = {
  id: 1,
  name: "Test Restaurant",
  cityName: "New York",
  lat: 40.7128,
  lng: -74.006,
};

describe("scrapeBeli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches and looks up when no existing ID", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "beli-123", name: "Test Restaurant", rating: 8.5, url: "https://beli.com/r" },
    ]);
    mockLookup.mockResolvedValue({
      name: "Test Restaurant",
      rating: 8.5,
      ratingCount: 42,
      url: "https://beli.com/r",
      neighborhood: "SoHo",
      cuisines: ["Italian"],
    });

    const result = await scrapeBeli(place);

    expect(mockSearch).toHaveBeenCalledWith("Test Restaurant", {
      city: "New York",
      lat: 40.7128,
      lng: -74.006,
    });
    expect(mockLookup).toHaveBeenCalledWith("beli-123");
    expect(result).toEqual({
      found: true,
      externalId: "beli-123",
      ratingData: {
        source: "beli",
        rating: 8.5,
        ratingMax: 10,
        notes: null,
        reviewCount: 42,
        ratingUrl: "https://beli.com/r",
        reviewDate: null,
        externalId: "beli-123",
      },
      placeData: null,
    });
  });

  it("skips search when existing ID is provided", async () => {
    mockLookup.mockResolvedValue({
      name: "Test Restaurant",
      rating: 9.0,
      ratingCount: 100,
      url: "https://beli.com/r",
      neighborhood: null,
      cuisines: [],
    });

    const result = await scrapeBeli(place, "existing-beli-id", "session1");

    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockLookup).toHaveBeenCalledWith("existing-beli-id");
    expect(result.externalId).toBe("existing-beli-id");
    expect(result.ratingData!.rating).toBe(9.0);
  });

  it("returns not found when search returns empty", async () => {
    mockSearch.mockResolvedValue([]);

    const result = await scrapeBeli(place);

    expect(result).toEqual({
      found: false,
      externalId: null,
      ratingData: null,
      placeData: null,
    });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("handles null rating", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "beli-456", name: "Test", rating: null, url: null },
    ]);
    mockLookup.mockResolvedValue({
      name: "Test",
      rating: null,
      ratingCount: null,
      url: null,
      neighborhood: null,
      cuisines: [],
    });

    const result = await scrapeBeli(place);

    expect(result.ratingData!.rating).toBeNull();
    expect(result.ratingData!.notes).toBeNull();
  });

  it("handles zero rating count", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "beli-789", name: "Test", rating: 7.0, url: null },
    ]);
    mockLookup.mockResolvedValue({
      name: "Test",
      rating: 7.0,
      ratingCount: 0,
      url: null,
      neighborhood: null,
      cuisines: [],
    });

    const result = await scrapeBeli(place);

    expect(result.ratingData!.notes).toBeNull();
  });
});

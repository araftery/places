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
  getInfatuationClient: () => ({ search: mockSearch, lookup: mockLookup }),
}));

import { scrapeInfatuation } from "../../providers/infatuation";

const place = {
  id: 1,
  name: "Test Restaurant",
  cityName: "New York",
  infatuationSlug: "/new-york",
  lat: 40.7128,
  lng: -74.006,
};

describe("scrapeInfatuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches and looks up when no existing ID", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "test-restaurant-nyc", name: "Test Restaurant", rating: 8.0, url: "https://theinfatuation.com/r" },
    ]);
    mockLookup.mockResolvedValue({
      name: "Test Restaurant",
      rating: 8.0,
      isCriticsPick: false,
      url: "https://theinfatuation.com/r",
      neighborhood: "SoHo",
      cuisines: ["Italian"],
    });

    const result = await scrapeInfatuation(place);

    expect(mockSearch).toHaveBeenCalledWith("Test Restaurant", {
      canonicalPath: "/new-york",
    });
    expect(mockLookup).toHaveBeenCalledWith("test-restaurant-nyc");
    expect(result).toEqual({
      found: true,
      externalId: "test-restaurant-nyc",
      ratingData: {
        source: "infatuation",
        rating: 8,
        ratingMax: 10,
        notes: null,
        reviewCount: null,
        ratingUrl: "https://theinfatuation.com/r",
        reviewDate: null,
        externalId: "test-restaurant-nyc",
      },
      placeData: null,
    });
  });

  it("skips search when existing ID is provided", async () => {
    mockLookup.mockResolvedValue({
      name: "Test Restaurant",
      rating: 9.1,
      isCriticsPick: true,
      url: "https://theinfatuation.com/r",
      neighborhood: "SoHo",
      cuisines: [],
    });

    const result = await scrapeInfatuation(place, "existing-slug", "session1");

    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockLookup).toHaveBeenCalledWith("existing-slug");
    expect(result.externalId).toBe("existing-slug");
    expect(result.ratingData!.notes).toBe("Critic's Pick");
  });

  it("returns not found when search returns empty", async () => {
    mockSearch.mockResolvedValue([]);

    const result = await scrapeInfatuation(place);

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
      { externalId: "slug-1", name: "Test", rating: null, url: null },
    ]);
    mockLookup.mockResolvedValue({
      name: "Test",
      rating: null,
      isCriticsPick: false,
      url: null,
      neighborhood: null,
      cuisines: [],
    });

    const result = await scrapeInfatuation(place);

    expect(result.ratingData!.rating).toBeNull();
    expect(result.ratingData!.notes).toBeNull();
  });

  it("uses null canonicalPath when infatuationSlug is null", async () => {
    mockSearch.mockResolvedValue([]);

    await scrapeInfatuation({ ...place, infatuationSlug: null });

    expect(mockSearch).toHaveBeenCalledWith("Test Restaurant", {
      canonicalPath: undefined,
    });
  });

  it("marks critics pick in notes", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "pick-place", name: "Pick", rating: 9.5, url: null },
    ]);
    mockLookup.mockResolvedValue({
      name: "Pick",
      rating: 9.5,
      isCriticsPick: true,
      url: "https://theinfatuation.com/pick",
      neighborhood: null,
      cuisines: [],
    });

    const result = await scrapeInfatuation(place);

    expect(result.ratingData!.notes).toBe("Critic's Pick");
  });
});

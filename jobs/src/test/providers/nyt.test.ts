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

vi.mock("../../utils/clients", () => ({
  getNytClient: () => ({ search: mockSearch }),
}));

import { scrapeNyt } from "../../providers/nyt";

const place = {
  id: 1,
  name: "Test Restaurant",
  cityName: "New York",
};

describe("scrapeNyt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches by place name when no existing ID", async () => {
    mockSearch.mockResolvedValue([
      {
        externalId: "nyt-123",
        name: "Test Restaurant",
        rating: 2,
        summary: "A great spot",
        url: "https://nytimes.com/review",
      },
    ]);

    const result = await scrapeNyt(place);

    expect(mockSearch).toHaveBeenCalledWith("Test Restaurant", { limit: 3 });
    expect(result).toEqual({
      found: true,
      externalId: "nyt-123",
      ratingData: {
        source: "nyt",
        rating: "2/3",
        notes: "A great spot",
        ratingUrl: "https://nytimes.com/review",
        externalId: "nyt-123",
      },
      placeData: null,
    });
  });

  it("uses existing external ID as search term", async () => {
    mockSearch.mockResolvedValue([
      {
        externalId: "nyt-existing",
        name: "Test Restaurant",
        rating: 3,
        summary: "Outstanding",
        url: "https://nytimes.com/r2",
      },
    ]);

    const result = await scrapeNyt(place, "nyt-existing", "session1");

    expect(mockSearch).toHaveBeenCalledWith("nyt-existing", { limit: 3 });
    expect(result.externalId).toBe("nyt-existing");
  });

  it("returns not found when search returns empty", async () => {
    mockSearch.mockResolvedValue([]);

    const result = await scrapeNyt(place);

    expect(result).toEqual({
      found: false,
      externalId: null,
      ratingData: null,
      placeData: null,
    });
  });

  it("handles null rating", async () => {
    mockSearch.mockResolvedValue([
      {
        externalId: "nyt-456",
        name: "Test Restaurant",
        rating: null,
        summary: "Listed but not rated",
        url: "https://nytimes.com/r3",
      },
    ]);

    const result = await scrapeNyt(place);

    expect(result.ratingData!.rating).toBeNull();
    expect(result.ratingData!.notes).toBe("Listed but not rated");
  });

  it("takes the first result from multiple", async () => {
    mockSearch.mockResolvedValue([
      { externalId: "first", name: "First", rating: 3, summary: "Best", url: "https://nyt.com/1" },
      { externalId: "second", name: "Second", rating: 1, summary: "Okay", url: "https://nyt.com/2" },
    ]);

    const result = await scrapeNyt(place);

    expect(result.externalId).toBe("first");
    expect(result.ratingData!.rating).toBe("3/3");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((opts: any) => opts),
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    trace: vi.fn((_name: string, fn: (span: any) => any) =>
      fn({ setAttribute: vi.fn() })
    ),
  },
}));

const mockSelectWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@places/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: mockSelectWhere })) })),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({ where: mockUpdateWhere }),
    })),
  },
}));

vi.mock("@places/db/schema", () => ({
  places: { id: "id", cityId: "city_id" },
  cities: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: any, b: any) => ({ _type: "eq", a, b })),
}));

const mockScrapeGoogle = vi.fn();
const mockScrapeInfatuation = vi.fn();
const mockScrapeBeli = vi.fn();
const mockScrapeNyt = vi.fn();

vi.mock("../../providers/google", () => ({
  scrapeGoogle: (...args: any[]) => mockScrapeGoogle(...args),
}));
vi.mock("../../providers/infatuation", () => ({
  scrapeInfatuation: (...args: any[]) => mockScrapeInfatuation(...args),
}));
vi.mock("../../providers/beli", () => ({
  scrapeBeli: (...args: any[]) => mockScrapeBeli(...args),
}));
vi.mock("../../providers/nyt", () => ({
  scrapeNyt: (...args: any[]) => mockScrapeNyt(...args),
}));

const mockUpsertRating = vi.fn();
const mockUpsertAudit = vi.fn();
const mockMarkAuditFailed = vi.fn();

vi.mock("../../utils/ratings", () => ({
  upsertRating: (...args: any[]) => mockUpsertRating(...args),
  upsertAudit: (...args: any[]) => mockUpsertAudit(...args),
  markAuditFailed: (...args: any[]) => mockMarkAuditFailed(...args),
}));

vi.mock("../../utils/errors", () => ({
  extractError: (err: any) => ({
    message: err.message ?? String(err),
    type: "Error",
    stack: undefined,
    cause: undefined,
    fullMessage: err.message ?? String(err),
  }),
}));

vi.mock("../../utils/clients", () => ({
  generateSessionId: () => "test-session",
}));

import { initiateCoverageTask } from "../../trigger/initiate-coverage";

// The mock returns the raw options object (which has .run), so we cast to any
const task = initiateCoverageTask as any;

const fakePlace = {
  id: 1,
  name: "Test Place",
  lat: 40.7,
  lng: -74.0,
  cityId: 10,
  googlePlaceId: "ChIJ123",
};

const fakeCity = {
  id: 10,
  name: "New York",
  providers: ["google", "infatuation", "beli", "nyt"],
  infatuationSlug: "/new-york",
};

describe("initiate-coverage task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("aborts when place is not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]); // place lookup

    await task.run({ placeId: 999 });

    expect(mockScrapeGoogle).not.toHaveBeenCalled();
  });

  it("scrapes all providers for a city", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([fakePlace]) // place lookup
      .mockResolvedValueOnce([fakeCity]); // city lookup

    const googleResult = {
      found: true,
      externalId: "ChIJ123",
      ratingData: { source: "google", rating: 4.5, ratingMax: 5, notes: null, reviewCount: null, ratingUrl: null, reviewDate: null, externalId: "ChIJ123" },
      placeData: { hoursJson: {}, closedPermanently: false },
    };
    const infResult = {
      found: true,
      externalId: "slug-1",
      ratingData: { source: "infatuation", rating: 8, ratingMax: 10, notes: null, reviewCount: null, ratingUrl: null, reviewDate: null, externalId: "slug-1" },
      placeData: null,
    };
    const beliResult = {
      found: false,
      externalId: null,
      ratingData: null,
      placeData: null,
    };
    const nytResult = {
      found: true,
      externalId: "nyt-1",
      ratingData: { source: "nyt", rating: 2, ratingMax: 4, notes: "Great", reviewCount: null, ratingUrl: null, reviewDate: null, externalId: "nyt-1" },
      placeData: null,
    };

    mockScrapeGoogle.mockResolvedValue(googleResult);
    mockScrapeInfatuation.mockResolvedValue(infResult);
    mockScrapeBeli.mockResolvedValue(beliResult);
    mockScrapeNyt.mockResolvedValue(nytResult);

    await task.run({ placeId: 1 });

    expect(mockScrapeGoogle).toHaveBeenCalled();
    expect(mockScrapeInfatuation).toHaveBeenCalled();
    expect(mockScrapeBeli).toHaveBeenCalled();
    expect(mockScrapeNyt).toHaveBeenCalled();

    // Ratings upserted for found results with ratingData
    expect(mockUpsertRating).toHaveBeenCalledTimes(3); // google, infatuation, nyt
    // Audit upserted for all 4
    expect(mockUpsertAudit).toHaveBeenCalledTimes(4);
  });

  it("defaults to google-only when place has no cityId", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ...fakePlace, cityId: null }]);

    mockScrapeGoogle.mockResolvedValue({
      found: true,
      externalId: "ChIJ123",
      ratingData: { source: "google", rating: 4, ratingMax: 5, notes: null, reviewCount: null, ratingUrl: null, reviewDate: null, externalId: "ChIJ123" },
      placeData: null,
    });

    await task.run({ placeId: 1 });

    expect(mockScrapeGoogle).toHaveBeenCalled();
    expect(mockScrapeInfatuation).not.toHaveBeenCalled();
    expect(mockScrapeBeli).not.toHaveBeenCalled();
    expect(mockScrapeNyt).not.toHaveBeenCalled();
  });

  it("skips infatuation when city has no slug", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([fakePlace])
      .mockResolvedValueOnce([{ ...fakeCity, infatuationSlug: null }]);

    mockScrapeGoogle.mockResolvedValue({
      found: true, externalId: "x", ratingData: null, placeData: null,
    });
    mockScrapeBeli.mockResolvedValue({
      found: false, externalId: null, ratingData: null, placeData: null,
    });
    mockScrapeNyt.mockResolvedValue({
      found: false, externalId: null, ratingData: null, placeData: null,
    });

    await task.run({ placeId: 1 });

    expect(mockScrapeInfatuation).not.toHaveBeenCalled();
  });

  it("handles scraper errors gracefully", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([fakePlace])
      .mockResolvedValueOnce([{ ...fakeCity, providers: ["google"] }]);

    mockScrapeGoogle.mockRejectedValue(new Error("API timeout"));

    await task.run({ placeId: 1 });

    expect(mockMarkAuditFailed).toHaveBeenCalledWith(1, "google", "API timeout");
  });

  it("updates place data when provider returns it", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([fakePlace])
      .mockResolvedValueOnce([{ ...fakeCity, providers: ["google"] }]);

    mockScrapeGoogle.mockResolvedValue({
      found: true,
      externalId: "ChIJ123",
      ratingData: { source: "google", rating: 4, ratingMax: 5, notes: null, reviewCount: null, ratingUrl: null, reviewDate: null, externalId: "ChIJ123" },
      placeData: { hoursJson: { periods: [] }, closedPermanently: false },
    });

    await task.run({ placeId: 1 });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        hoursJson: { periods: [] },
        closedPermanently: false,
      })
    );
  });
});

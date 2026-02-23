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

const mockGetPlaceDetails = vi.fn();

vi.mock("../../utils/clients", () => ({
  getGoogleClient: () => ({ getPlaceDetails: mockGetPlaceDetails }),
}));

import { scrapeGoogle } from "../../providers/google";

describe("scrapeGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found when googlePlaceId is null", async () => {
    const result = await scrapeGoogle({
      id: 1,
      name: "Test Place",
      googlePlaceId: null,
    });

    expect(result).toEqual({
      found: false,
      externalId: null,
      ratingData: null,
      placeData: null,
    });
    expect(mockGetPlaceDetails).not.toHaveBeenCalled();
  });

  it("returns rating and place data on success", async () => {
    mockGetPlaceDetails.mockResolvedValue({
      rating: 4.5,
      userRatingCount: 120,
      businessStatus: "OPERATIONAL",
      regularOpeningHours: { periods: [] },
    });

    const result = await scrapeGoogle({
      id: 1,
      name: "Test Place",
      googlePlaceId: "ChIJ123",
    });

    expect(result).toEqual({
      found: true,
      externalId: "ChIJ123",
      ratingData: {
        source: "google",
        rating: "4.5/5",
        notes: "120 reviews",
        ratingUrl: null,
        externalId: "ChIJ123",
      },
      placeData: {
        hoursJson: { periods: [] },
        closedPermanently: false,
      },
    });
  });

  it("detects permanently closed places", async () => {
    mockGetPlaceDetails.mockResolvedValue({
      rating: 3.0,
      userRatingCount: 50,
      businessStatus: "CLOSED_PERMANENTLY",
      regularOpeningHours: null,
    });

    const result = await scrapeGoogle({
      id: 1,
      name: "Closed Place",
      googlePlaceId: "ChIJ456",
    });

    expect(result.placeData).toEqual({
      hoursJson: null,
      closedPermanently: true,
    });
  });

  it("handles null rating", async () => {
    mockGetPlaceDetails.mockResolvedValue({
      rating: null,
      userRatingCount: 0,
      businessStatus: "OPERATIONAL",
    });

    const result = await scrapeGoogle({
      id: 1,
      name: "New Place",
      googlePlaceId: "ChIJ789",
    });

    expect(result.ratingData!.rating).toBeNull();
    expect(result.ratingData!.notes).toBeNull();
  });

  it("handles undefined rating and review count", async () => {
    mockGetPlaceDetails.mockResolvedValue({
      businessStatus: "OPERATIONAL",
    });

    const result = await scrapeGoogle({
      id: 1,
      name: "Sparse Place",
      googlePlaceId: "ChIJabc",
    });

    expect(result.ratingData!.rating).toBeNull();
    expect(result.ratingData!.notes).toBeNull();
  });
});

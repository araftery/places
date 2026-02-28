import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

// We need to use vi.hoisted so mocks are available at hoist time
const { mockSelectWhere, mockInsertValues, mockUpdateSet, mockUpdateWhere } = vi.hoisted(() => ({
  mockSelectWhere: vi.fn(),
  mockInsertValues: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@places/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: mockSelectWhere })),
    })),
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({ where: mockUpdateWhere }),
    })),
  },
}));

vi.mock("@places/db/schema", () => ({
  placeRatings: { id: "id", placeId: "place_id", source: "source" },
  placeAudits: { id: "id", placeId: "place_id", provider: "provider" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: any, b: any) => ({ _type: "eq", a, b })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
}));

import { upsertRating, upsertAudit, markAuditFailed } from "../../utils/ratings";

describe("upsertRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("inserts a new rating when none exists", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    await upsertRating(1, {
      source: "google",
      rating: 4.5,
      ratingMax: 5,
      notes: "120 reviews",
      reviewCount: 120,
      ratingUrl: null,
      reviewDate: null,
      externalId: "ChIJ123",
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: 1,
        source: "google",
        rating: 4.5,
        ratingMax: 5,
        notes: "120 reviews",
        externalId: "ChIJ123",
      })
    );
  });

  it("updates existing rating", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { id: 99, rating: 4.0, ratingMax: 5, notes: "100 reviews", reviewCount: 100, ratingUrl: null },
    ]);

    await upsertRating(1, {
      source: "google",
      rating: 4.5,
      ratingMax: 5,
      notes: "120 reviews",
      reviewCount: 120,
      ratingUrl: null,
      reviewDate: null,
      externalId: "ChIJ123",
    });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 4.5,
        notes: "120 reviews",
        externalId: "ChIJ123",
      })
    );
  });
});

describe("upsertAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("inserts a new audit when none exists", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    await upsertAudit(
      1,
      "google",
      { found: true, externalId: "ChIJ123", ratingData: null, placeData: null },
      7
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: 1,
        provider: "google",
        externalId: "ChIJ123",
        status: "success",
        error: null,
      })
    );
  });

  it("updates existing audit", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 50 }]);

    await upsertAudit(
      1,
      "google",
      { found: true, externalId: "ChIJ123", ratingData: null, placeData: null },
      7
    );

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "ChIJ123",
        status: "success",
        error: null,
      })
    );
  });

  it("sets status to not_found when result.found is false", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    await upsertAudit(
      1,
      "beli",
      { found: false, externalId: null, ratingData: null, placeData: null },
      14
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "not_found",
      })
    );
  });

  it("calculates nextAuditAt based on days parameter", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const before = new Date();
    await upsertAudit(
      1,
      "google",
      { found: true, externalId: "x", ratingData: null, placeData: null },
      7
    );

    const call = mockInsertValues.mock.calls[0][0];
    const nextAuditAt = call.nextAuditAt as Date;
    const diffDays = (nextAuditAt.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });
});

describe("markAuditFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("inserts a failed audit when none exists", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    await markAuditFailed(1, "google", "Connection timeout");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: 1,
        provider: "google",
        status: "failed",
        error: "Connection timeout",
        externalId: null,
        nextAuditAt: null,
      })
    );
  });

  it("updates existing audit to failed", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 50 }]);

    await markAuditFailed(1, "google", "API error");

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "API error",
      })
    );
  });
});

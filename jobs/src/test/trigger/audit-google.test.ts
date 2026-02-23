import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((opts: any) => opts) },
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

const mockSelectFrom = vi.fn();
const mockSelectFromWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@places/db", () => ({
  db: {
    select: vi.fn((cols?: any) => {
      // Audit queries use column selection; place queries don't
      if (cols) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: mockSelectFrom,
            })),
          })),
        };
      }
      return { from: vi.fn(() => ({ where: mockSelectFromWhere })) };
    }),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({ where: mockUpdateWhere }),
    })),
  },
}));

vi.mock("@places/db/schema", () => ({
  places: { id: "id" },
  placeAudits: { id: "id", placeId: "place_id", provider: "provider", nextAuditAt: "next_audit_at" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign(vi.fn(() => "now()"), { raw: vi.fn() }),
}));

const mockScrapeGoogle = vi.fn();
vi.mock("../../providers/google", () => ({
  scrapeGoogle: (...args: any[]) => mockScrapeGoogle(...args),
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
    message: err.message,
    type: "Error",
    stack: undefined,
    cause: undefined,
    fullMessage: err.message,
  }),
}));

import { auditGoogleTask } from "../../trigger/audit-google";

describe("audit-google task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("exits early when no audits are due", async () => {
    mockSelectFrom.mockResolvedValueOnce([]);

    await auditGoogleTask.run({} as any);

    expect(mockScrapeGoogle).not.toHaveBeenCalled();
  });

  it("processes due audits and upserts results", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "ChIJ123" },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", googlePlaceId: "ChIJ123", lat: 40.7, lng: -74 },
    ]);
    mockScrapeGoogle.mockResolvedValue({
      found: true,
      externalId: "ChIJ123",
      ratingData: { source: "google", rating: "4.5/5", notes: null, ratingUrl: null, externalId: "ChIJ123" },
      placeData: { hoursJson: {}, closedPermanently: false },
    });

    await auditGoogleTask.run({} as any);

    expect(mockScrapeGoogle).toHaveBeenCalledTimes(1);
    expect(mockUpsertRating).toHaveBeenCalledTimes(1);
    expect(mockUpsertAudit).toHaveBeenCalledWith(10, "google", expect.anything(), 7);
  });

  it("skips places that no longer exist", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 99, externalId: null },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([]); // place not found

    await auditGoogleTask.run({} as any);

    expect(mockScrapeGoogle).not.toHaveBeenCalled();
  });

  it("handles scraper errors and marks audit failed", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "ChIJ123" },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", googlePlaceId: "ChIJ123", lat: 40.7, lng: -74 },
    ]);
    mockScrapeGoogle.mockRejectedValue(new Error("rate limited"));

    await auditGoogleTask.run({} as any);

    expect(mockMarkAuditFailed).toHaveBeenCalledWith(10, "google", "rate limited");
  });

  it("processes multiple audits in batch", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "ChIJ1" },
      { auditId: 2, placeId: 20, externalId: "ChIJ2" },
    ]);
    mockSelectFromWhere
      .mockResolvedValueOnce([{ id: 10, name: "Place A", googlePlaceId: "ChIJ1", lat: 40.7, lng: -74 }])
      .mockResolvedValueOnce([{ id: 20, name: "Place B", googlePlaceId: "ChIJ2", lat: 41.0, lng: -73 }]);

    mockScrapeGoogle.mockResolvedValue({
      found: true,
      externalId: "x",
      ratingData: { source: "google", rating: "4/5", notes: null, ratingUrl: null, externalId: "x" },
      placeData: null,
    });

    await auditGoogleTask.run({} as any);

    expect(mockScrapeGoogle).toHaveBeenCalledTimes(2);
    expect(mockUpsertAudit).toHaveBeenCalledTimes(2);
  });
});

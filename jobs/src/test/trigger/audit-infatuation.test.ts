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
const mockUpdateWhere = vi.fn();

vi.mock("@places/db", () => ({
  db: {
    select: vi.fn((cols?: any) => {
      if (cols) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: mockSelectFrom })),
          })),
        };
      }
      return { from: vi.fn(() => ({ where: mockSelectFromWhere })) };
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mockUpdateWhere })),
    })),
  },
}));

vi.mock("@places/db/schema", () => ({
  places: { id: "id", cityId: "city_id" },
  placeAudits: { id: "id", placeId: "place_id", provider: "provider", nextAuditAt: "next_audit_at" },
  cities: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign(vi.fn(() => "now()"), { raw: vi.fn() }),
}));

const mockScrapeInfatuation = vi.fn();
vi.mock("../../providers/infatuation", () => ({
  scrapeInfatuation: (...args: any[]) => mockScrapeInfatuation(...args),
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

vi.mock("../../utils/clients", () => ({
  generateSessionId: () => "test-session",
}));

import { auditInfatuationTask } from "../../trigger/audit-infatuation";

describe("audit-infatuation task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("exits early when no audits are due", async () => {
    mockSelectFrom.mockResolvedValueOnce([]);

    await auditInfatuationTask.run({} as any);

    expect(mockScrapeInfatuation).not.toHaveBeenCalled();
  });

  it("processes due audits with city slug", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "slug-1" },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", cityId: 5, lat: 40.7, lng: -74 },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 5, name: "New York", infatuationSlug: "/new-york" },
    ]);

    mockScrapeInfatuation.mockResolvedValue({
      found: true,
      externalId: "slug-1",
      ratingData: { source: "infatuation", rating: "8/10", notes: null, ratingUrl: null, externalId: "slug-1" },
      placeData: null,
    });

    await auditInfatuationTask.run({} as any);

    expect(mockScrapeInfatuation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, cityName: "New York", infatuationSlug: "/new-york" }),
      "slug-1",
      "test-session"
    );
    expect(mockUpsertAudit).toHaveBeenCalledWith(10, "infatuation", expect.anything(), 30);
  });

  it("skips when no city slug and no existing externalId", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: null },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", cityId: 5, lat: 40.7, lng: -74 },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 5, name: "Small Town", infatuationSlug: null },
    ]);

    await auditInfatuationTask.run({} as any);

    expect(mockScrapeInfatuation).not.toHaveBeenCalled();
  });

  it("still scrapes when no city slug but has existing externalId", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "known-slug" },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", cityId: 5, lat: 40.7, lng: -74 },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 5, name: "Small Town", infatuationSlug: null },
    ]);

    mockScrapeInfatuation.mockResolvedValue({
      found: true,
      externalId: "known-slug",
      ratingData: { source: "infatuation", rating: "7/10", notes: null, ratingUrl: null, externalId: "known-slug" },
      placeData: null,
    });

    await auditInfatuationTask.run({} as any);

    expect(mockScrapeInfatuation).toHaveBeenCalled();
  });

  it("handles scraper errors", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "slug-1" },
    ]);
    mockSelectFromWhere
      .mockResolvedValueOnce([{ id: 10, name: "Place A", cityId: null, lat: 40.7, lng: -74 }]);

    mockScrapeInfatuation.mockRejectedValue(new Error("scrape failed"));

    await auditInfatuationTask.run({} as any);

    expect(mockMarkAuditFailed).toHaveBeenCalledWith(10, "infatuation", "scrape failed");
  });
});

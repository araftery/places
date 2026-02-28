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

const mockScrapeBeli = vi.fn();
vi.mock("../../providers/beli", () => ({
  scrapeBeli: (...args: any[]) => mockScrapeBeli(...args),
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

import { auditBeliTask } from "../../trigger/audit-beli";

// The mock returns the raw options object (which has .run), so we cast to any
const task = auditBeliTask as any;

describe("audit-beli task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("exits early when no audits are due", async () => {
    mockSelectFrom.mockResolvedValueOnce([]);

    await task.run({} as any);

    expect(mockScrapeBeli).not.toHaveBeenCalled();
  });

  it("processes due audits with city lookup", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: "beli-123" },
    ]);
    // place lookup
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 10, name: "Place A", cityId: 5, lat: 40.7, lng: -74 },
    ]);
    // city lookup
    mockSelectFromWhere.mockResolvedValueOnce([
      { id: 5, name: "New York" },
    ]);

    mockScrapeBeli.mockResolvedValue({
      found: true,
      externalId: "beli-123",
      ratingData: { source: "beli", rating: 8, ratingMax: 10, notes: null, reviewCount: 42, ratingUrl: null, reviewDate: null, externalId: "beli-123" },
      placeData: null,
    });

    await task.run({} as any);

    expect(mockScrapeBeli).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, name: "Place A", cityName: "New York" }),
      "beli-123",
      "test-session"
    );
    expect(mockUpsertRating).toHaveBeenCalledTimes(1);
    expect(mockUpsertAudit).toHaveBeenCalledWith(10, "beli", expect.anything(), 14);
  });

  it("skips places that no longer exist", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 99, externalId: null },
    ]);
    mockSelectFromWhere.mockResolvedValueOnce([]);

    await task.run({} as any);

    expect(mockScrapeBeli).not.toHaveBeenCalled();
  });

  it("handles scraper errors", async () => {
    mockSelectFrom.mockResolvedValueOnce([
      { auditId: 1, placeId: 10, externalId: null },
    ]);
    mockSelectFromWhere
      .mockResolvedValueOnce([{ id: 10, name: "Place A", cityId: null, lat: 40.7, lng: -74 }]);

    mockScrapeBeli.mockRejectedValue(new Error("proxy error"));

    await task.run({} as any);

    expect(mockMarkAuditFailed).toHaveBeenCalledWith(10, "beli", "proxy error");
  });
});

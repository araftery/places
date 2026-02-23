"use client";

import { Place } from "@/lib/types";
import { useState } from "react";

interface ReviewBannerProps {
  closedPlaces: Place[];
  stalePlaces: Place[];
  onArchive: (id: number) => void;
  onDismissClosed: (id: number) => void;
  onSelectPlace: (place: Place) => void;
}

export default function ReviewBanner({
  closedPlaces,
  stalePlaces,
  onArchive,
  onDismissClosed,
  onSelectPlace,
}: ReviewBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedStaleIds, setDismissedStaleIds] = useState<Set<number>>(
    new Set()
  );

  const totalCount =
    closedPlaces.length +
    stalePlaces.filter((p) => !dismissedStaleIds.has(p.id)).length;

  if (totalCount === 0) return null;

  const visibleStale = stalePlaces.filter(
    (p) => !dismissedStaleIds.has(p.id)
  );

  return (
    <div className="relative z-10 border-b border-[var(--color-sidebar-border)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-[var(--color-sidebar-surface)]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-[10px] font-bold text-white">
          {totalCount}
        </span>
        <span className="text-xs font-medium text-[var(--color-sidebar-text)]">
          {totalCount === 1 ? "1 place" : `${totalCount} places`} to review
        </span>
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-sidebar-muted)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="max-h-[300px] overflow-y-auto px-4 pb-3 sidebar-scroll">
          {/* Closed places */}
          {closedPlaces.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-terracotta)]">
                Permanently Closed
              </p>
              <div className="space-y-1.5">
                {closedPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-terracotta)]/20 bg-[var(--color-terracotta)]/5 p-2.5"
                  >
                    <button
                      onClick={() => onSelectPlace(place)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-semibold text-[var(--color-sidebar-text)]">
                        {place.name}
                      </p>
                      {place.neighborhood && (
                        <p className="truncate text-[10px] text-[var(--color-sidebar-muted)]">
                          {place.neighborhood}
                          {place.city ? `, ${place.city}` : ""}
                        </p>
                      )}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => onArchive(place.id)}
                        className="rounded-md bg-[var(--color-terracotta)] px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[var(--color-terracotta)]/80"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => onDismissClosed(place.id)}
                        className="rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stale places */}
          {visibleStale.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                Added 6+ Months Ago
              </p>
              <div className="space-y-1.5">
                {visibleStale.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-2.5"
                  >
                    <button
                      onClick={() => onSelectPlace(place)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-semibold text-[var(--color-sidebar-text)]">
                        {place.name}
                      </p>
                      {place.neighborhood && (
                        <p className="truncate text-[10px] text-[var(--color-sidebar-muted)]">
                          {place.neighborhood}
                          {place.city ? `, ${place.city}` : ""}
                        </p>
                      )}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => onArchive(place.id)}
                        className="rounded-md bg-[var(--color-sidebar-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() =>
                          setDismissedStaleIds(
                            (prev) => new Set([...prev, place.id])
                          )
                        }
                        className="rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

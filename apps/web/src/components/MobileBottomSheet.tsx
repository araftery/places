"use client";

import { useState } from "react";
import { Place, Tag, City, PLACE_TYPES } from "@/lib/types";
import PlaceCard from "./PlaceCard";
import ReviewBanner from "./ReviewBanner";
import { Filters, DEFAULT_FILTERS, applyFilters } from "./Sidebar";
import type { TravelTimeBand } from "@/app/page";

interface MobileBottomSheetProps {
  places: Place[];
  tags: Tag[];
  cities: City[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
  onOpenAdd: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onManageTags: () => void;
  travelTimes?: Map<number, TravelTimeBand>;
  reviewClosed?: Place[];
  reviewStale?: Place[];
  onReviewArchive?: (id: number) => void;
  onReviewDismissClosed?: (id: number) => void;
}

export default function MobileBottomSheet({
  places,
  tags,
  cities,
  selectedPlace,
  onSelectPlace,
  onOpenAdd,
  filters,
  onFiltersChange,
  onManageTags,
  travelTimes,
  reviewClosed = [],
  reviewStale = [],
  onReviewArchive,
  onReviewDismissClosed,
}: MobileBottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filteredPlaces = applyFilters(places, filters);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-[var(--color-sidebar-bg)] transition-all duration-300 md:hidden ${
        expanded ? "top-[20vh]" : "h-[180px]"
      }`}
      style={{ boxShadow: "0 -4px 24px rgba(26,22,18,0.25)" }}
    >
      {/* Handle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col items-center py-2.5"
      >
        <div className="h-1 w-10 rounded-full bg-[var(--color-sidebar-border)]" />
      </button>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex items-center gap-2">
          <h2
            className="text-sm font-semibold text-[var(--color-sidebar-text)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            {filteredPlaces.length} places
          </h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 rounded-md bg-[var(--color-sidebar-surface)] px-2 py-1 text-xs text-[var(--color-sidebar-muted)]"
          >
            Filters
            {(filters.showArchived ? 1 : 0) +
              filters.tagIds.length +
              filters.placeTypes.length +
              (filters.openNow ? 1 : 0) >
              0 && (
              <span className="rounded bg-[var(--color-amber)] px-1 text-[10px] font-bold text-white">
                {(filters.showArchived ? 1 : 0) +
                  filters.tagIds.length +
                  filters.placeTypes.length +
                  (filters.openNow ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={onOpenAdd}
          className="flex items-center gap-1 rounded-md bg-[var(--color-amber)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <input
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          className="w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-1.5 text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
          placeholder="Search places..."
        />
      </div>

      {/* Mobile Filters */}
      {showFilters && (
        <div className="space-y-2 border-t border-[var(--color-sidebar-border)] px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() =>
                onFiltersChange({ ...filters, showArchived: !filters.showArchived })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filters.showArchived
                  ? "bg-[var(--color-amber)] text-white"
                  : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]"
              }`}
            >
              Show Archived
            </button>
          </div>
          <div>
            <button
              onClick={() =>
                onFiltersChange({ ...filters, openNow: !filters.openNow })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filters.openNow
                  ? "bg-[var(--color-amber)] text-white"
                  : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]"
              }`}
            >
              Open Now
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                Tags
              </p>
              <button
                onClick={onManageTags}
                className="text-[11px] font-medium text-[var(--color-amber)]"
              >
                Manage
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    tagIds: filters.tagIds.includes(tag.id)
                      ? filters.tagIds.filter((id) => id !== tag.id)
                      : [...filters.tagIds, tag.id],
                  })
                }
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  filters.tagIds.includes(tag.id)
                    ? "text-white"
                    : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]"
                }`}
                style={
                  filters.tagIds.includes(tag.id)
                    ? { backgroundColor: tag.color }
                    : {}
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLACE_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    placeTypes: filters.placeTypes.includes(t.value)
                      ? filters.placeTypes.filter((v) => v !== t.value)
                      : [...filters.placeTypes, t.value],
                  })
                }
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  filters.placeTypes.includes(t.value)
                    ? "bg-[var(--color-amber)] text-white"
                    : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-xs text-[var(--color-amber)]"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Review Banner */}
      {onReviewArchive && onReviewDismissClosed && (
        <ReviewBanner
          closedPlaces={reviewClosed}
          stalePlaces={reviewStale}
          onArchive={onReviewArchive}
          onDismissClosed={onReviewDismissClosed}
          onSelectPlace={onSelectPlace}
        />
      )}

      {/* Place list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 sidebar-scroll">
        <div className="space-y-2">
          {filteredPlaces.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              isSelected={selectedPlace?.id === place.id}
              onClick={() => onSelectPlace(place)}
              travelTime={travelTimes?.get(place.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

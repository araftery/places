"use client";

import { Place, Tag, City, PLACE_TYPES } from "@/lib/types";
import PlaceCard from "./PlaceCard";
import ReviewBanner from "./ReviewBanner";
import { useState, useMemo } from "react";
import type { TravelTimeBand } from "@/app/page";

interface SidebarProps {
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

export interface Filters {
  search: string;
  showArchived: boolean;
  tagIds: number[];
  placeTypes: string[];
  cityId: number | null;
  neighborhood: string;
  cuisine: string;
  priceRange: number[];
  openNow: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  showArchived: false,
  tagIds: [],
  placeTypes: [],
  cityId: null,
  neighborhood: "",
  cuisine: "",
  priceRange: [],
  openNow: false,
};

interface HoursPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

interface HoursData {
  periods?: HoursPeriod[];
}

function isPlaceOpenNow(place: Place): boolean | null {
  const hours = place.hoursJson as HoursData | null | undefined;
  if (!hours?.periods || hours.periods.length === 0) return null;

  const now = new Date();
  // Google Places API uses Sunday=0, same as JS getDay()
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const nowMinutes = day * 24 * 60 + hour * 60 + minute;

  for (const period of hours.periods) {
    if (!period.open) continue;

    // A period with open but no close means open 24/7
    if (!period.close) return true;

    const openMinutes =
      period.open.day * 24 * 60 + period.open.hour * 60 + period.open.minute;
    const closeMinutes =
      period.close.day * 24 * 60 +
      period.close.hour * 60 +
      period.close.minute;

    if (closeMinutes > openMinutes) {
      // Normal case: open and close on the same day or later in the week
      if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) return true;
    } else {
      // Wraps around the week boundary (e.g., Saturday night → Sunday morning)
      if (nowMinutes >= openMinutes || nowMinutes < closeMinutes) return true;
    }
  }

  return false;
}

export function applyFilters(places: Place[], filters: Filters): Place[] {
  return places.filter((p) => {
    if (
      filters.search &&
      !p.name.toLowerCase().includes(filters.search.toLowerCase())
    )
      return false;

    if (!filters.showArchived && p.archived) return false;

    if (filters.tagIds.length > 0) {
      const placeTagIds = p.tags.map((t) => t.id);
      if (!filters.tagIds.some((id) => placeTagIds.includes(id))) return false;
    }

    if (
      filters.placeTypes.length > 0 &&
      (!p.placeType || !filters.placeTypes.includes(p.placeType))
    )
      return false;

    if (filters.cityId !== null && p.cityId !== filters.cityId) return false;

    if (
      filters.neighborhood &&
      (!p.neighborhood ||
        !p.neighborhood
          .toLowerCase()
          .includes(filters.neighborhood.toLowerCase()))
    )
      return false;

    if (filters.cuisine) {
      const searchCuisine = filters.cuisine.toLowerCase();
      if (
        !p.cuisineType ||
        !p.cuisineType.some((c) => c.toLowerCase().includes(searchCuisine))
      )
        return false;
    }

    if (
      filters.priceRange.length > 0 &&
      (!p.priceRange || !filters.priceRange.includes(p.priceRange))
    )
      return false;

    if (filters.openNow) {
      const openStatus = isPlaceOpenNow(p);
      // null means unknown hours — keep visible per requirements
      if (openStatus === false) return false;
    }

    return true;
  });
}

export default function Sidebar({
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
}: SidebarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredPlaces = useMemo(
    () => applyFilters(places, filters),
    [places, filters]
  );

  const neighborhoods = useMemo(() => {
    const set = new Set(
      places.map((p) => p.neighborhood).filter(Boolean) as string[]
    );
    return Array.from(set).sort();
  }, [places]);

  const activeFilterCount =
    (filters.showArchived ? 1 : 0) +
    filters.tagIds.length +
    filters.placeTypes.length +
    (filters.cityId !== null ? 1 : 0) +
    (filters.neighborhood ? 1 : 0) +
    (filters.cuisine ? 1 : 0) +
    filters.priceRange.length +
    (filters.openNow ? 1 : 0);

  return (
    <div className="relative flex h-full flex-col bg-[var(--color-sidebar-bg)] grain">
      {/* Header */}
      <div className="relative z-10 border-b border-[var(--color-sidebar-border)] px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <h1
            className="text-xl tracking-tight text-[var(--color-sidebar-text)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Places
          </h1>
          <button
            onClick={onOpenAdd}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-amber)] px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-amber-light)]"
          >
            <svg
              width="14"
              height="14"
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
        <div className="relative mt-3">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-sidebar-muted)]"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={filters.search}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
            className="block w-full rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] transition-colors focus:border-[var(--color-amber)] focus:outline-none"
            placeholder="Search places..."
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="12" y1="18" x2="20" y2="18" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[var(--color-amber)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="relative z-10 space-y-3 border-b border-[var(--color-sidebar-border)] px-5 py-4">
          {/* Show Archived */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() =>
                onFiltersChange({ ...filters, showArchived: !filters.showArchived })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                filters.showArchived
                  ? "bg-[var(--color-amber)] text-white"
                  : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
              }`}
            >
              Show Archived
            </button>
          </div>

          {/* Open Now */}
          <div>
            <button
              onClick={() =>
                onFiltersChange({ ...filters, openNow: !filters.openNow })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                filters.openNow
                  ? "bg-[var(--color-amber)] text-white"
                  : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
              }`}
            >
              Open Now
            </button>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                  Tags
                </p>
                <button
                  onClick={onManageTags}
                  className="text-[11px] font-medium text-[var(--color-amber)] transition-colors hover:text-[var(--color-amber-light)]"
                >
                  Manage
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = filters.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          tagIds: active
                            ? filters.tagIds.filter((id) => id !== tag.id)
                            : [...filters.tagIds, tag.id],
                        })
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        active
                          ? "text-white"
                          : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                      }`}
                      style={active ? { backgroundColor: tag.color } : {}}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Type */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              Type
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PLACE_TYPES.map((t) => {
                const active = filters.placeTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        placeTypes: active
                          ? filters.placeTypes.filter((v) => v !== t.value)
                          : [...filters.placeTypes, t.value],
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      active
                        ? "bg-[var(--color-amber)] text-white"
                        : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City & Neighborhood */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                City
              </p>
              <select
                value={filters.cityId ?? ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    cityId: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                className="block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-2 py-1.5 text-xs text-[var(--color-sidebar-text)]"
              >
                <option value="">All</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                Neighborhood
              </p>
              <select
                value={filters.neighborhood}
                onChange={(e) =>
                  onFiltersChange({ ...filters, neighborhood: e.target.value })
                }
                className="block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-2 py-1.5 text-xs text-[var(--color-sidebar-text)]"
              >
                <option value="">All</option>
                {neighborhoods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Price Range */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              Price Range
            </p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((p) => {
                const active = filters.priceRange.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        priceRange: active
                          ? filters.priceRange.filter((v) => v !== p)
                          : [...filters.priceRange, p],
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      active
                        ? "bg-[var(--color-amber)] text-white"
                        : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                    }`}
                  >
                    {"$".repeat(p)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cuisine */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              Cuisine
            </p>
            <input
              value={filters.cuisine}
              onChange={(e) =>
                onFiltersChange({ ...filters, cuisine: e.target.value })
              }
              className="block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-2.5 py-1.5 text-xs text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
              placeholder="e.g. Italian"
            />
          </div>

          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-xs text-[var(--color-amber)] hover:text-[var(--color-amber-light)]"
          >
            Clear all filters
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

      {/* Place List */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-3 sidebar-scroll">
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-sidebar-muted)]">
          {filteredPlaces.length} place{filteredPlaces.length !== 1 ? "s" : ""}
        </p>
        <div className="space-y-2">
          {filteredPlaces.map((place, i) => (
            <div
              key={place.id}
              className="animate-fade-slide-in"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <PlaceCard
                place={place}
                isSelected={selectedPlace?.id === place.id}
                onClick={() => onSelectPlace(place)}
                travelTime={travelTimes?.get(place.id)}
              />
            </div>
          ))}
          {filteredPlaces.length === 0 && (
            <p className="py-12 text-center text-sm text-[var(--color-sidebar-muted)]">
              No places found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

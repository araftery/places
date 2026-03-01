"use client";

import { Place, Tag, City, Cuisine, PLACE_TYPES } from "@/lib/types";
import PlaceCard from "./PlaceCard";

import DiscoverPanel from "./DiscoverPanel";
import type { DiscoverPin } from "./DiscoverPanel";
import { useState, useMemo, useRef, useEffect } from "react";
import type { TravelTimeBand } from "@/lib/geo";

export type SortOption = "recent" | "rating" | "name" | "nearest";

interface SidebarProps {
  places: Place[];
  tags: Tag[];
  cuisines: Cuisine[];
  cities: City[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
  onOpenAdd: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onManageTags: () => void;
  travelTimes?: Map<number, TravelTimeBand>;
  selectedCityId: number | null;
  onCityChange: (cityId: number | null) => void;
  isochroneActive?: boolean;
  isoGeoJson?: GeoJSON.FeatureCollection | null;
  allPlaces?: Place[];
  onPlaceAdded?: (place: Place) => void;
  onDiscoverPinsChange?: (pins: DiscoverPin[]) => void;
  selectedDiscoverIndex?: number | null;
  onSelectDiscoverIndex?: (index: number | null) => void;
  activeTab: "places" | "discover";
  onActiveTabChange: (tab: "places" | "discover") => void;
}

export interface Filters {
  search: string;
  showArchived: boolean;
  tagIds: number[];
  placeTypes: string[];
  neighborhood: string;
  cuisineIds: number[];
  priceRange: number[];
  openNow: boolean;
  findTable: boolean;
  findTableDate: string;
  findTablePartySize: number;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  showArchived: false,
  tagIds: [],
  placeTypes: [],
  neighborhood: "",
  cuisineIds: [],
  priceRange: [],
  openNow: false,
  findTable: false,
  findTableDate: "",
  findTablePartySize: 2,
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

function isPlaceOpenOnDay(place: Place, dayOfWeek: number): boolean | null {
  const hours = place.hoursJson as HoursData | null | undefined;
  if (!hours?.periods || hours.periods.length === 0) return null;

  for (const period of hours.periods) {
    if (!period.open) continue;
    if (period.open.day === dayOfWeek) return true;
  }

  return false;
}

const NON_DINING_TYPES = ["tourist_site", "retail", "other"];

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

    if (
      filters.neighborhood &&
      (!p.neighborhood ||
        !p.neighborhood
          .toLowerCase()
          .includes(filters.neighborhood.toLowerCase()))
    )
      return false;

    if (filters.cuisineIds.length > 0) {
      const placeCuisineIds = p.cuisines?.map((c) => c.id) || [];
      if (!filters.cuisineIds.some((id) => placeCuisineIds.includes(id))) return false;
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

    if (filters.findTable && filters.findTableDate) {
      // Exclude non-dining types
      if (p.placeType && NON_DINING_TYPES.includes(p.placeType)) return false;

      // Exclude places closed on that day
      const targetDate = new Date(filters.findTableDate + "T12:00:00");
      const dayOfWeek = targetDate.getDay();
      const openOnDay = isPlaceOpenOnDay(p, dayOfWeek);
      if (openOnDay === false) return false;

      // Reservation availability logic
      const provider = p.reservationProvider;
      if (provider === "none") return false;
      // walk_in or unknown provider → passes
      if (provider === "walk_in" || !provider) {
        // passes
      } else {
        // Has a booking provider — check availability window
        const targetDateStr = filters.findTableDate;
        if (p.lastAvailableDate) {
          // If target is beyond last available date → passes (not yet open)
          // If target is within → passes (might have availability)
          // Both cases pass — we can't check live availability yet
        } else if (p.openingWindowDays) {
          // No lastAvailableDate but we know the window — estimate
          // Both within and beyond window pass for now
        }
        // If we have no window info at all, pass (optimistic)
      }
    }

    return true;
  });
}

export default function Sidebar({
  places,
  tags,
  cuisines,
  cities,
  selectedPlace,
  onSelectPlace,
  onOpenAdd,
  filters,
  onFiltersChange,
  onManageTags,
  travelTimes,
  selectedCityId,
  onCityChange,
  isochroneActive,
  isoGeoJson,
  allPlaces,
  onPlaceAdded,
  onDiscoverPinsChange,
  selectedDiscoverIndex,
  onSelectDiscoverIndex,
  activeTab,
  onActiveTabChange,
}: SidebarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [preSortBy, setPreSortBy] = useState<SortOption>("recent");

  // Auto-switch to "nearest" when isochrone activates, revert when it deactivates
  const prevIsoRef = useRef(false);
  useEffect(() => {
    if (isochroneActive && !prevIsoRef.current) {
      setPreSortBy(sortBy);
      setSortBy("nearest");
    }
    if (!isochroneActive && prevIsoRef.current && sortBy === "nearest") {
      setSortBy(preSortBy);
    }
    prevIsoRef.current = !!isochroneActive;
  }, [isochroneActive]);

  const filteredPlaces = useMemo(
    () => applyFilters(places, filters),
    [places, filters]
  );

  const sortedPlaces = useMemo(() => {
    const sorted = [...filteredPlaces];
    switch (sortBy) {
      case "recent":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "rating": {
        const getRating = (p: Place) => p.ratings?.find((r) => r.source === "google")?.rating ?? -1;
        sorted.sort((a, b) => getRating(b) - getRating(a));
        break;
      }
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "nearest": {
        const getMinutes = (p: Place) => travelTimes?.get(p.id)?.minutes ?? Infinity;
        sorted.sort((a, b) => getMinutes(a) - getMinutes(b));
        break;
      }
    }
    return sorted;
  }, [filteredPlaces, sortBy, travelTimes]);

  const neighborhoods = useMemo(() => {
    const source = selectedCityId ? places.filter((p) => p.cityId === selectedCityId) : places;
    const set = new Set(
      source.map((p) => p.neighborhood).filter(Boolean) as string[]
    );
    return Array.from(set).sort();
  }, [places, selectedCityId]);

  const usedCuisines = useMemo(() => {
    const usedIds = new Set<number>();
    for (const p of places) {
      for (const c of p.cuisines || []) {
        usedIds.add(c.id);
      }
    }
    return cuisines.filter((c) => usedIds.has(c.id));
  }, [places, cuisines]);

  const activeFilterCount =
    (filters.showArchived ? 1 : 0) +
    filters.tagIds.length +
    filters.placeTypes.length +
    (filters.neighborhood ? 1 : 0) +
    filters.cuisineIds.length +
    filters.priceRange.length +
    (filters.openNow ? 1 : 0) +
    (filters.findTable ? 1 : 0);

  const selectedCity = useMemo(
    () => (selectedCityId ? cities.find((c) => c.id === selectedCityId) : null),
    [selectedCityId, cities]
  );
  const hasDiscover = !!selectedCity?.infatuationSlug;

  return (
    <div className="relative flex h-full flex-col bg-[var(--color-sidebar-bg)] grain">
      {/* Header */}
      <div className="relative z-10 border-b border-[var(--color-sidebar-border)] px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <select
            value={selectedCityId ?? ""}
            onChange={(e) => onCityChange(e.target.value ? parseInt(e.target.value) : null)}
            className="appearance-none bg-transparent text-xl tracking-tight text-[var(--color-sidebar-text)] cursor-pointer pr-6 focus:outline-none"
            style={{
              fontFamily: "var(--font-libre-baskerville)",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a7e72' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0 center",
            }}
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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

        {/* Tab bar */}
        {hasDiscover && (
          <div className="mt-3 flex gap-4 border-b border-[var(--color-sidebar-border)]">
            <button
              onClick={() => onActiveTabChange("places")}
              className={`pb-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                activeTab === "places"
                  ? "border-b-2 border-[var(--color-amber)] text-[var(--color-amber)]"
                  : "text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
              }`}
            >
              My Places
            </button>
            <button
              onClick={() => onActiveTabChange("discover")}
              className={`pb-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                activeTab === "discover"
                  ? "border-b-2 border-[var(--color-amber)] text-[var(--color-amber)]"
                  : "text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
              }`}
            >
              Discover
            </button>
          </div>
        )}

        {activeTab === "places" && (
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
        )}
      </div>

      {/* Discover Tab */}
      {activeTab === "discover" && hasDiscover && selectedCity?.infatuationSlug && onDiscoverPinsChange && (
        <div className="relative z-10 flex-1 overflow-y-auto py-3 sidebar-scroll">
          <DiscoverPanel
            citySlug={selectedCity.infatuationSlug}
            cityId={selectedCity.id}
            existingPlaces={allPlaces || places}
            onPlaceAdded={onPlaceAdded || (() => { /* noop */ })}
            onDiscoverPinsChange={onDiscoverPinsChange}
            selectedDiscoverIndex={selectedDiscoverIndex ?? null}
            onSelectDiscoverIndex={onSelectDiscoverIndex || (() => {})}
            isoGeoJson={isoGeoJson}
            onOpenPlace={onSelectPlace}
          />
        </div>
      )}

      {/* Filters Panel */}
      {activeTab === "places" && showFilters && (
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

          {/* Find a Table */}
          <div>
            <button
              onClick={() =>
                onFiltersChange({ ...filters, findTable: !filters.findTable })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                filters.findTable
                  ? "bg-[var(--color-amber)] text-white"
                  : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
              }`}
            >
              Find a Table
            </button>
            {filters.findTable && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={filters.findTableDate}
                    onChange={(e) =>
                      onFiltersChange({ ...filters, findTableDate: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-2.5 py-1.5 text-xs text-[var(--color-sidebar-text)] focus:border-[var(--color-amber)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                    Party Size
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          findTablePartySize: Math.max(1, filters.findTablePartySize - 1),
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-xs text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                    >
                      -
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-medium text-[var(--color-sidebar-text)]">
                      {filters.findTablePartySize}
                    </span>
                    <button
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          findTablePartySize: filters.findTablePartySize + 1,
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-xs text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
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

          {/* Neighborhood */}
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
          {usedCuisines.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                Cuisine
              </p>
              <div className="flex flex-wrap gap-1.5">
                {usedCuisines.map((c) => {
                  const active = filters.cuisineIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          cuisineIds: active
                            ? filters.cuisineIds.filter((id) => id !== c.id)
                            : [...filters.cuisineIds, c.id],
                        })
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        active
                          ? "bg-[var(--color-amber)] text-white"
                          : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-xs text-[var(--color-amber)] hover:text-[var(--color-amber-light)]"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Place List */}
      {activeTab === "places" && (
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-3 sidebar-scroll">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              {sortedPlaces.length} place{sortedPlaces.length !== 1 ? "s" : ""}
            </p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none bg-transparent text-[11px] font-medium text-[var(--color-sidebar-muted)] cursor-pointer pr-4 focus:outline-none hover:text-[var(--color-sidebar-text)]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%238a7e72' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0 center",
              }}
            >
              <option value="recent">Recently added</option>
              <option value="rating">Highest rated</option>
              <option value="name">Name A–Z</option>
              {isochroneActive && <option value="nearest">Nearest</option>}
            </select>
          </div>
          <div className="space-y-2">
            {sortedPlaces.map((place, i) => (
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
                  compact={sortedPlaces.length >= 10}
                />
              </div>
            ))}
            {sortedPlaces.length === 0 && (
              <p className="py-12 text-center text-sm text-[var(--color-sidebar-muted)]">
                No places found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

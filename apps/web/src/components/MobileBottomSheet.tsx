"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Place, Tag, City, Cuisine, PLACE_TYPES } from "@/lib/types";
import PlaceCard from "./PlaceCard";

import DiscoverPanel from "./DiscoverPanel";
import type { DiscoverPin } from "./DiscoverPanel";
import { Filters, DEFAULT_FILTERS, applyFilters, SortOption } from "./Sidebar";
import type { TravelTimeBand } from "@/lib/geo";

interface MobileBottomSheetProps {
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

export default function MobileBottomSheet({
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
}: MobileBottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [preSortBy, setPreSortBy] = useState<SortOption>("recent");

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

  const filteredPlaces = applyFilters(places, filters);

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

  const usedCuisines = useMemo(() => {
    const usedIds = new Set<number>();
    for (const p of places) {
      for (const c of p.cuisines || []) {
        usedIds.add(c.id);
      }
    }
    return cuisines.filter((c) => usedIds.has(c.id));
  }, [places, cuisines]);

  const selectedCity = useMemo(
    () => (selectedCityId ? cities.find((c) => c.id === selectedCityId) : null),
    [selectedCityId, cities]
  );
  const hasDiscover = !!selectedCity?.infatuationSlug;

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
          <select
            value={selectedCityId ?? ""}
            onChange={(e) => onCityChange(e.target.value ? parseInt(e.target.value) : null)}
            className="appearance-none bg-transparent text-sm font-semibold text-[var(--color-sidebar-text)] cursor-pointer pr-5 focus:outline-none"
            style={{
              fontFamily: "var(--font-libre-baskerville)",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%238a7e72' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
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
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 rounded-md bg-[var(--color-sidebar-surface)] px-2 py-1 text-xs text-[var(--color-sidebar-muted)]"
          >
            Filters
            {(filters.showArchived ? 1 : 0) +
              filters.tagIds.length +
              filters.placeTypes.length +
              filters.cuisineIds.length +
              (filters.openNow ? 1 : 0) >
              0 && (
              <span className="rounded bg-[var(--color-amber)] px-1 text-[10px] font-bold text-white">
                {(filters.showArchived ? 1 : 0) +
                  filters.tagIds.length +
                  filters.placeTypes.length +
                  filters.cuisineIds.length +
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

      {/* Tab bar */}
      {hasDiscover && (
        <div className="flex gap-4 px-4 pb-2">
          <button
            onClick={() => onActiveTabChange("places")}
            className={`pb-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "places"
                ? "border-b-2 border-[var(--color-amber)] text-[var(--color-amber)]"
                : "text-[var(--color-sidebar-muted)]"
            }`}
          >
            My Places
          </button>
          <button
            onClick={() => onActiveTabChange("discover")}
            className={`pb-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "discover"
                ? "border-b-2 border-[var(--color-amber)] text-[var(--color-amber)]"
                : "text-[var(--color-sidebar-muted)]"
            }`}
          >
            Discover
          </button>
        </div>
      )}

      {/* Discover Panel */}
      {activeTab === "discover" && hasDiscover && selectedCity?.infatuationSlug && onDiscoverPinsChange && (
        <div className="flex-1 overflow-y-auto py-2 sidebar-scroll">
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

      {/* Search */}
      {activeTab === "places" && (
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
      )}

      {/* Mobile Filters */}
      {activeTab === "places" && showFilters && (
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
          {usedCuisines.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
                Cuisine
              </p>
              <div className="flex flex-wrap gap-1.5">
                {usedCuisines.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        cuisineIds: filters.cuisineIds.includes(c.id)
                          ? filters.cuisineIds.filter((id) => id !== c.id)
                          : [...filters.cuisineIds, c.id],
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filters.cuisineIds.includes(c.id)
                        ? "bg-[var(--color-amber)] text-white"
                        : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-xs text-[var(--color-amber)]"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Sort + Place list */}
      {activeTab === "places" && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 sidebar-scroll">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-sidebar-muted)]">
              {sortedPlaces.length} place{sortedPlaces.length !== 1 ? "s" : ""}
            </p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none bg-transparent text-[11px] font-medium text-[var(--color-sidebar-muted)] cursor-pointer pr-4 focus:outline-none"
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
            {sortedPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlace?.id === place.id}
                onClick={() => onSelectPlace(place)}
                travelTime={travelTimes?.get(place.id)}
                compact={sortedPlaces.length >= 10}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DiscoverRestaurantCard from "./DiscoverRestaurantCard";
import type { GuideListItem, GuideContent, GuideRestaurant } from "@places/clients/infatuation";
import type { Place } from "@/lib/types";
import { isInIsochrone, getTravelTimeBand, type TravelTimeBand } from "@/lib/geo";

export interface DiscoverPin {
  lat: number;
  lng: number;
  name: string;
  rating: number | null;
  alreadyInList: boolean;
  matchedPlaceId: number | null;
}

interface DiscoverPanelProps {
  citySlug: string;
  cityId: number;
  existingPlaces: Place[];
  onPlaceAdded: () => void;
  onDiscoverPinsChange: (pins: DiscoverPin[]) => void;
  selectedDiscoverIndex: number | null;
  onSelectDiscoverIndex: (index: number | null) => void;
  isoGeoJson?: GeoJSON.FeatureCollection | null;
  onOpenPlace?: (place: Place) => void;
}

type AddStatus = "idle" | "adding" | "added" | "duplicate" | "no-match";

export default function DiscoverPanel({
  citySlug,
  cityId,
  existingPlaces,
  onPlaceAdded,
  onDiscoverPinsChange,
  selectedDiscoverIndex,
  onSelectDiscoverIndex,
  isoGeoJson,
  onOpenPlace,
}: DiscoverPanelProps) {
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [selectedGuideSlug, setSelectedGuideSlug] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<GuideContent | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [addStatuses, setAddStatuses] = useState<Record<string, AddStatus>>({});
  const [addedSlugs, setAddedSlugs] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingOpenPlaceId, setPendingOpenPlaceId] = useState<number | null>(null);

  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPlaces) {
      set.add(p.name.toLowerCase());
    }
    return set;
  }, [existingPlaces]);

  // Match by Infatuation review slug from place_ratings
  const existingInfatuationSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPlaces) {
      for (const r of p.ratings || []) {
        if (r.source === "infatuation" && r.externalId) {
          set.add(r.externalId);
        }
      }
    }
    return set;
  }, [existingPlaces]);

  // Find the matching Place for a discover restaurant
  const findMatchingPlace = useCallback(
    (restaurant: GuideRestaurant): Place | null => {
      // Match by Infatuation slug first
      if (restaurant.reviewSlug) {
        const match = existingPlaces.find((p) =>
          p.ratings?.some(
            (r) => r.source === "infatuation" && r.externalId === restaurant.reviewSlug
          )
        );
        if (match) return match;
      }
      // Fallback: match by name
      const name = (restaurant.venue.name || restaurant.title).toLowerCase();
      return existingPlaces.find((p) => p.name.toLowerCase() === name) || null;
    },
    [existingPlaces]
  );

  const isAlreadyInList = useCallback(
    (restaurant: GuideRestaurant) => {
      // Primary: match by Infatuation review slug
      if (restaurant.reviewSlug && existingInfatuationSlugs.has(restaurant.reviewSlug)) {
        return true;
      }
      // Fallback: match by name
      return existingNames.has((restaurant.venue.name || restaurant.title).toLowerCase());
    },
    [existingInfatuationSlugs, existingNames]
  );

  // Auto-open newly added place once it appears in existingPlaces
  useEffect(() => {
    if (pendingOpenPlaceId == null || !onOpenPlace) return;
    const place = existingPlaces.find((p) => p.id === pendingOpenPlaceId);
    if (place) {
      setPendingOpenPlaceId(null);
      onOpenPlace(place);
    }
  }, [pendingOpenPlaceId, existingPlaces, onOpenPlace]);

  // Fetch guides for city
  useEffect(() => {
    setGuides([]);
    setSelectedGuideSlug(null);
    setSelectedGuide(null);
    setLoadingGuides(true);
    onDiscoverPinsChange([]);

    fetch(`/api/discover/guides?citySlug=${encodeURIComponent(citySlug)}`)
      .then((res) => res.json())
      .then((data: GuideListItem[]) => {
        setGuides(data);

        // Auto-select guide
        const openingsGuide = data.find((g) =>
          g.title.toLowerCase().includes("opening")
        );
        const hitListGuide = data.find((g) =>
          g.title.toLowerCase().includes("hit list")
        );
        const autoSelect = openingsGuide || hitListGuide;
        if (autoSelect) {
          setSelectedGuideSlug(autoSelect.slug);
        }
      })
      .catch(() => setGuides([]))
      .finally(() => setLoadingGuides(false));
  }, [citySlug]);

  // Fetch guide content when selected
  useEffect(() => {
    if (!selectedGuideSlug) {
      setSelectedGuide(null);
      onDiscoverPinsChange([]);
      return;
    }

    setLoadingGuide(true);
    setSelectedGuide(null);
    setAddStatuses({});
    setErrors({});

    fetch(`/api/discover/guides/${encodeURIComponent(selectedGuideSlug)}`)
      .then((res) => res.json())
      .then((data: GuideContent) => {
        setSelectedGuide(data);
      })
      .catch(() => setSelectedGuide(null))
      .finally(() => setLoadingGuide(false));
  }, [selectedGuideSlug]);

  // Get displayable restaurants — Contentful returns them in display order
  // (newest first for New Openings), so we preserve that order.
  const displayRestaurants = useMemo(() => {
    if (!selectedGuide) return [];

    const titleLower = selectedGuide.title.toLowerCase();
    const isNewOpenings = titleLower.includes("opening");

    if (isNewOpenings) {
      return selectedGuide.restaurants.slice(0, 75);
    }

    return selectedGuide.restaurants;
  }, [selectedGuide]);

  // When isochrone active: filter to restaurants within isochrone, compute travel times
  const isochroneActive = !!isoGeoJson;
  const [sortByTime, setSortByTime] = useState(false);

  const filteredRestaurants = useMemo(() => {
    if (!isoGeoJson) return displayRestaurants;
    return displayRestaurants.filter((r) => {
      if (r.venue.lat == null || r.venue.lng == null) return false;
      return isInIsochrone(r.venue.lat, r.venue.lng, isoGeoJson);
    });
  }, [displayRestaurants, isoGeoJson]);

  // Travel time bands for each restaurant (keyed by restaurant index in filteredRestaurants)
  const restaurantTravelTimes = useMemo(() => {
    const map = new Map<number, TravelTimeBand>();
    if (!isoGeoJson) return map;
    for (let i = 0; i < filteredRestaurants.length; i++) {
      const r = filteredRestaurants[i];
      if (r.venue.lat == null || r.venue.lng == null) continue;
      const band = getTravelTimeBand(r.venue.lat, r.venue.lng, isoGeoJson);
      if (band) map.set(i, band);
    }
    return map;
  }, [filteredRestaurants, isoGeoJson]);

  // Auto-enable time sort when isochrone activates
  const prevIsoRef = useRef(false);
  useEffect(() => {
    if (isochroneActive && !prevIsoRef.current) {
      setSortByTime(true);
    }
    if (!isochroneActive && prevIsoRef.current) {
      setSortByTime(false);
    }
    prevIsoRef.current = isochroneActive;
  }, [isochroneActive]);

  // Final sorted list
  const sortedRestaurants = useMemo(() => {
    if (!sortByTime || !isoGeoJson) return filteredRestaurants;
    const withIndex = filteredRestaurants.map((r, i) => ({ r, i }));
    withIndex.sort((a, b) => {
      const aMin = restaurantTravelTimes.get(a.i)?.minutes ?? Infinity;
      const bMin = restaurantTravelTimes.get(b.i)?.minutes ?? Infinity;
      return aMin - bMin;
    });
    return withIndex.map(({ r }) => r);
  }, [filteredRestaurants, sortByTime, isoGeoJson, restaurantTravelTimes]);

  // Travel time lookup by restaurant object (for sorted list rendering)
  const getTravelTime = useCallback(
    (restaurant: GuideRestaurant): TravelTimeBand | null => {
      if (!isoGeoJson || restaurant.venue.lat == null || restaurant.venue.lng == null) return null;
      return getTravelTimeBand(restaurant.venue.lat, restaurant.venue.lng, isoGeoJson);
    },
    [isoGeoJson]
  );

  // Build index mappings between sorted restaurant list and pin list.
  // Pins are the subset of sortedRestaurants that have lat/lng, in order.
  const { restaurantToPinIndex, pinToRestaurantIndex } = useMemo(() => {
    const r2p = new Map<number, number>();
    const p2r = new Map<number, number>();
    let pinIdx = 0;
    for (let ri = 0; ri < sortedRestaurants.length; ri++) {
      const r = sortedRestaurants[ri];
      if (r.venue.lat != null && r.venue.lng != null) {
        r2p.set(ri, pinIdx);
        p2r.set(pinIdx, ri);
        pinIdx++;
      }
    }
    return { restaurantToPinIndex: r2p, pinToRestaurantIndex: p2r };
  }, [sortedRestaurants]);

  // Derive map pins from sortedRestaurants so sidebar and map always match
  useEffect(() => {
    if (!sortedRestaurants.length) {
      onDiscoverPinsChange([]);
      return;
    }
    const pins: DiscoverPin[] = sortedRestaurants
      .filter((r) => r.venue.lat != null && r.venue.lng != null)
      .map((r) => {
        const inList = isAlreadyInList(r);
        const matched = inList ? findMatchingPlace(r) : null;
        return {
          lat: r.venue.lat!,
          lng: r.venue.lng!,
          name: r.venue.name || r.title,
          rating: r.rating,
          alreadyInList: inList,
          matchedPlaceId: matched?.id ?? null,
        };
      });
    onDiscoverPinsChange(pins);
  }, [sortedRestaurants, isAlreadyInList, findMatchingPlace]);

  const handleAdd = useCallback(
    async (restaurant: GuideRestaurant) => {
      const key = restaurant.reviewSlug || restaurant.venue.name;
      setAddStatuses((prev) => ({ ...prev, [key]: "adding" }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const res = await fetch("/api/discover/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: restaurant.venue.name || restaurant.title,
            lat: restaurant.venue.lat,
            lng: restaurant.venue.lng,
            cityId,
            source: `Infatuation: ${selectedGuide?.title || "Guide"}`,
          }),
        });

        const data = await res.json();

        if (!data.matched) {
          setAddStatuses((prev) => ({ ...prev, [key]: "no-match" }));
          setErrors((prev) => ({ ...prev, [key]: "No Google match found" }));
          return;
        }

        if (data.duplicate) {
          setAddStatuses((prev) => ({ ...prev, [key]: "duplicate" }));
          setErrors((prev) => ({
            ...prev,
            [key]: `Already saved as "${data.existingName}"`,
          }));
          return;
        }

        setAddStatuses((prev) => ({ ...prev, [key]: "added" }));
        setAddedSlugs((prev) => new Set(prev).add(key));
        if (data.place?.id) {
          setPendingOpenPlaceId(data.place.id);
        }
        onPlaceAdded();
      } catch {
        setAddStatuses((prev) => ({ ...prev, [key]: "no-match" }));
        setErrors((prev) => ({ ...prev, [key]: "Failed to add" }));
      }
    },
    [cityId, selectedGuide, onPlaceAdded]
  );

  const handleBack = useCallback(() => {
    setSelectedGuideSlug(null);
    setSelectedGuide(null);
    onDiscoverPinsChange([]);
    onSelectDiscoverIndex(null);
  }, [onDiscoverPinsChange, onSelectDiscoverIndex]);

  const handleSelectRestaurant = useCallback(
    (restaurantIndex: number, restaurant: GuideRestaurant) => {
      const pinIndex = restaurantToPinIndex.get(restaurantIndex);
      if (pinIndex != null) {
        onSelectDiscoverIndex(pinIndex);
      }
      // If already in list, open place details
      if (isAlreadyInList(restaurant) && onOpenPlace) {
        const place = findMatchingPlace(restaurant);
        if (place) onOpenPlace(place);
      }
    },
    [restaurantToPinIndex, onSelectDiscoverIndex, isAlreadyInList, findMatchingPlace, onOpenPlace]
  );

  // When a pin is selected from the map, scroll the corresponding card into view
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (selectedDiscoverIndex == null) return;
    const ri = pinToRestaurantIndex.get(selectedDiscoverIndex);
    if (ri == null) return;
    const el = cardRefs.current.get(ri);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedDiscoverIndex, pinToRestaurantIndex]);

  // Loading state
  if (loadingGuides) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
      </div>
    );
  }

  // No guides
  if (guides.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-sidebar-muted)]">
        No Infatuation guides found for this city
      </div>
    );
  }

  // Guide detail view
  if (selectedGuideSlug) {
    return (
      <div className="flex flex-col">
        {/* Header — sticky so it stays visible while scrolling */}
        <div className="sticky -top-3 z-10 flex items-center gap-2 bg-[var(--color-sidebar-bg)] px-4 pb-3 pt-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-xs text-[var(--color-amber)] transition-colors hover:text-[var(--color-amber-light)]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Guides
          </button>
        </div>

        {loadingGuide ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
          </div>
        ) : selectedGuide ? (
          <>
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between">
                <h3
                  className="text-sm font-semibold text-[var(--color-sidebar-text)]"
                  style={{ fontFamily: "var(--font-libre-baskerville)" }}
                >
                  {selectedGuide.title}
                </h3>
                {isochroneActive && (
                  <button
                    onClick={() => setSortByTime(!sortByTime)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                      sortByTime
                        ? "bg-[var(--color-amber)] text-white"
                        : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                    }`}
                  >
                    Nearest
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-sidebar-muted)]">
                {sortedRestaurants.length} restaurant{sortedRestaurants.length !== 1 ? "s" : ""}
                {isochroneActive && sortedRestaurants.length < displayRestaurants.length && (
                  <span> nearby</span>
                )}
              </p>
            </div>
            <div className="space-y-2 px-4 pb-4">
              {sortedRestaurants.map((restaurant, i) => {
                const key = restaurant.reviewSlug || restaurant.venue.name;
                const pinIndex = restaurantToPinIndex.get(i);
                const isSelected = pinIndex != null && pinIndex === selectedDiscoverIndex;
                const travelTime = getTravelTime(restaurant);
                return (
                  <div
                    key={key + i}
                    ref={(el) => {
                      if (el) cardRefs.current.set(i, el);
                      else cardRefs.current.delete(i);
                    }}
                    className="animate-fade-slide-in scroll-mt-12"
                    style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                  >
                    <DiscoverRestaurantCard
                      restaurant={restaurant}
                      guideTitle={selectedGuide.title}
                      cityId={cityId}
                      status={addStatuses[key] || "idle"}
                      error={errors[key] || null}
                      alreadyInList={isAlreadyInList(restaurant)}
                      onAdd={() => handleAdd(restaurant)}
                      isSelected={isSelected}
                      onClick={() => handleSelectRestaurant(i, restaurant)}
                      showDate
                      travelTime={travelTime}
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-sm text-[var(--color-sidebar-muted)]">
            Failed to load guide
          </div>
        )}
      </div>
    );
  }

  // Guide list view
  return (
    <div className="space-y-2 px-4 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]">
        {guides.length} guide{guides.length !== 1 ? "s" : ""}
      </p>
      {guides.map((guide, i) => (
        <button
          key={guide.slug}
          onClick={() => setSelectedGuideSlug(guide.slug)}
          className="block w-full animate-fade-slide-in rounded-lg bg-[var(--color-sidebar-surface)] p-3 text-left transition-colors hover:bg-[var(--color-sidebar-border)]"
          style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
        >
          <h4
            className="text-sm font-semibold text-[var(--color-sidebar-text)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            {guide.title}
          </h4>
          {guide.previewText && (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-sidebar-muted)] line-clamp-2">
              {guide.previewText}
            </p>
          )}
          {guide.publishedAt && (
            <p className="mt-1 text-[10px] text-[var(--color-sidebar-muted)]">
              {new Date(guide.publishedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

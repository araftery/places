"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import MichelinRestaurantCard from "./MichelinRestaurantCard";
import type { MichelinRestaurant, MichelinListResult } from "@places/clients/michelin";
import type { DiscoverPin } from "./DiscoverPanel";
import type { Place } from "@/lib/types";
import { isInIsochrone, getTravelTimeBand, type TravelTimeBand } from "@/lib/geo";

type AddStatus = "idle" | "adding" | "added" | "duplicate" | "no-match";

const DISTINCTION_FILTERS = [
  { value: null, label: "All" },
  { value: "THREE_STARS", label: "3 Stars" },
  { value: "TWO_STARS", label: "2 Stars" },
  { value: "ONE_STAR", label: "1 Star" },
  { value: "BIB_GOURMAND", label: "Bib Gourmand" },
  { value: "selected", label: "Selected" },
] as const;

interface MichelinDiscoverViewProps {
  citySlug: string;
  cityId: number;
  existingPlaces: Place[];
  onPlaceAdded: (place: Place) => void;
  onDiscoverPinsChange: (pins: DiscoverPin[]) => void;
  selectedDiscoverIndex: number | null;
  onSelectDiscoverIndex: (index: number | null) => void;
  isoGeoJson?: GeoJSON.FeatureCollection | null;
  onOpenPlace?: (place: Place) => void;
}

export default function MichelinDiscoverView({
  citySlug,
  cityId,
  existingPlaces,
  onPlaceAdded,
  onDiscoverPinsChange,
  selectedDiscoverIndex,
  onSelectDiscoverIndex,
  isoGeoJson,
  onOpenPlace,
}: MichelinDiscoverViewProps) {
  const [restaurants, setRestaurants] = useState<MichelinRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [distinction, setDistinction] = useState<string | null>(null);
  const [addStatuses, setAddStatuses] = useState<Record<string, AddStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Match by Michelin objectID from place_ratings
  const existingMichelinIds = useMemo(() => {
    const map = new Map<string, Place>();
    for (const p of existingPlaces) {
      for (const r of p.ratings || []) {
        if (r.source === "michelin" && r.externalId) {
          map.set(r.externalId, p);
        }
      }
    }
    return map;
  }, [existingPlaces]);

  const findMatchingPlace = useCallback(
    (restaurant: MichelinRestaurant): Place | null => {
      return existingMichelinIds.get(restaurant.objectID) ?? null;
    },
    [existingMichelinIds]
  );

  const isAlreadyInList = useCallback(
    (restaurant: MichelinRestaurant) => {
      return existingMichelinIds.has(restaurant.objectID);
    },
    [existingMichelinIds]
  );

  // Fetch restaurants
  const fetchRestaurants = useCallback(
    async (pageNum: number, reset: boolean) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({ citySlug, page: String(pageNum) });
        if (distinction) params.set("distinction", distinction);

        const res = await fetch(`/api/discover/michelin?${params}`);
        const data: MichelinListResult = await res.json();

        if (reset) {
          setRestaurants(data.restaurants);
        } else {
          setRestaurants((prev) => [...prev, ...data.restaurants]);
        }
        setTotalHits(data.totalHits);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } catch {
        if (reset) setRestaurants([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [citySlug, distinction]
  );

  // Reload on slug or distinction change
  useEffect(() => {
    setRestaurants([]);
    setPage(0);
    setAddStatuses({});
    setErrors({});
    onDiscoverPinsChange([]);
    fetchRestaurants(0, true);
  }, [citySlug, distinction]);

  // Isochrone filtering
  const isochroneActive = !!isoGeoJson;
  const [sortByTime, setSortByTime] = useState(false);

  const filteredRestaurants = useMemo(() => {
    if (!isoGeoJson) return restaurants;
    return restaurants.filter((r) => {
      if (r.lat == null || r.lng == null) return false;
      return isInIsochrone(r.lat, r.lng, isoGeoJson);
    });
  }, [restaurants, isoGeoJson]);

  const restaurantTravelTimes = useMemo(() => {
    const map = new Map<number, TravelTimeBand>();
    if (!isoGeoJson) return map;
    for (let i = 0; i < filteredRestaurants.length; i++) {
      const r = filteredRestaurants[i];
      if (r.lat == null || r.lng == null) continue;
      const band = getTravelTimeBand(r.lat, r.lng, isoGeoJson);
      if (band) map.set(i, band);
    }
    return map;
  }, [filteredRestaurants, isoGeoJson]);

  const prevIsoRef = useRef(false);
  useEffect(() => {
    if (isochroneActive && !prevIsoRef.current) setSortByTime(true);
    if (!isochroneActive && prevIsoRef.current) setSortByTime(false);
    prevIsoRef.current = isochroneActive;
  }, [isochroneActive]);

  const sortedRestaurants = useMemo(() => {
    const getDistinctionRank = (r: MichelinRestaurant) => {
      if (r.stars >= 3) return 0;
      if (r.stars === 2) return 1;
      if (r.stars === 1) return 2;
      if (r.distinction === "BIB_GOURMAND" || r.distinction === "bib_gourmand") return 3;
      return 4; // selected
    };

    if (sortByTime && isoGeoJson) {
      const withIndex = filteredRestaurants.map((r, i) => ({ r, i }));
      withIndex.sort((a, b) => {
        const aMin = restaurantTravelTimes.get(a.i)?.minutes ?? Infinity;
        const bMin = restaurantTravelTimes.get(b.i)?.minutes ?? Infinity;
        return aMin - bMin;
      });
      return withIndex.map(({ r }) => r);
    }

    return [...filteredRestaurants].sort((a, b) => getDistinctionRank(a) - getDistinctionRank(b));
  }, [filteredRestaurants, sortByTime, isoGeoJson, restaurantTravelTimes]);

  const getTravelTime = useCallback(
    (restaurant: MichelinRestaurant): TravelTimeBand | null => {
      if (!isoGeoJson || restaurant.lat == null || restaurant.lng == null) return null;
      return getTravelTimeBand(restaurant.lat, restaurant.lng, isoGeoJson);
    },
    [isoGeoJson]
  );

  // Pin ↔ card index mapping
  const { restaurantToPinIndex, pinToRestaurantIndex } = useMemo(() => {
    const r2p = new Map<number, number>();
    const p2r = new Map<number, number>();
    let pinIdx = 0;
    for (let ri = 0; ri < sortedRestaurants.length; ri++) {
      const r = sortedRestaurants[ri];
      if (r.lat != null && r.lng != null) {
        r2p.set(ri, pinIdx);
        p2r.set(pinIdx, ri);
        pinIdx++;
      }
    }
    return { restaurantToPinIndex: r2p, pinToRestaurantIndex: p2r };
  }, [sortedRestaurants]);

  // Derive map pins
  useEffect(() => {
    if (!sortedRestaurants.length) {
      onDiscoverPinsChange([]);
      return;
    }
    const pins: DiscoverPin[] = sortedRestaurants
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const inList = isAlreadyInList(r);
        const matched = inList ? findMatchingPlace(r) : null;
        return {
          lat: r.lat!,
          lng: r.lng!,
          name: r.name,
          rating: r.stars > 0 ? r.stars : null,
          alreadyInList: inList,
          matchedPlaceId: matched?.id ?? null,
        };
      });
    onDiscoverPinsChange(pins);
  }, [sortedRestaurants, isAlreadyInList, findMatchingPlace]);

  const handleAdd = useCallback(
    async (restaurant: MichelinRestaurant, restaurantIndex: number) => {
      const pinIndex = restaurantToPinIndex.get(restaurantIndex);
      if (pinIndex != null) onSelectDiscoverIndex(pinIndex);

      const key = restaurant.objectID;
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
            name: restaurant.name,
            lat: restaurant.lat,
            lng: restaurant.lng,
            cityId,
            source: `Michelin: ${restaurant.distinction}`,
            michelinObjectId: restaurant.objectID,
            michelinStars: restaurant.stars,
            michelinDistinction: buildDistinctionNotes(restaurant),
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
          if (onOpenPlace && data.existingId) {
            const existingPlace = existingPlaces.find((p) => p.id === data.existingId);
            if (existingPlace) onOpenPlace(existingPlace);
          }
          return;
        }

        const newPlace: Place = data.place;
        setAddStatuses((prev) => ({ ...prev, [key]: "added" }));
        onPlaceAdded(newPlace);
        if (onOpenPlace) onOpenPlace(newPlace);
      } catch {
        setAddStatuses((prev) => ({ ...prev, [key]: "no-match" }));
        setErrors((prev) => ({ ...prev, [key]: "Failed to add" }));
      }
    },
    [cityId, onPlaceAdded, onOpenPlace, existingPlaces, restaurantToPinIndex, onSelectDiscoverIndex]
  );

  const handleSelectRestaurant = useCallback(
    (restaurantIndex: number, restaurant: MichelinRestaurant) => {
      const pinIndex = restaurantToPinIndex.get(restaurantIndex);
      if (pinIndex != null) onSelectDiscoverIndex(pinIndex);
      if (isAlreadyInList(restaurant) && onOpenPlace) {
        const place = findMatchingPlace(restaurant);
        if (place) onOpenPlace(place);
      }
    },
    [restaurantToPinIndex, onSelectDiscoverIndex, isAlreadyInList, findMatchingPlace, onOpenPlace]
  );

  // Scroll card into view when pin is selected from map
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (selectedDiscoverIndex == null) return;
    const ri = pinToRestaurantIndex.get(selectedDiscoverIndex);
    if (ri == null) return;
    const el = cardRefs.current.get(ri);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDiscoverIndex, pinToRestaurantIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Distinction filter chips */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {DISTINCTION_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setDistinction(f.value)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
              distinction === f.value
                ? "bg-[var(--color-amber)] text-white"
                : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-sidebar-muted)]">
            {sortedRestaurants.length} restaurant{sortedRestaurants.length !== 1 ? "s" : ""}
            {isochroneActive && sortedRestaurants.length < restaurants.length && (
              <span> nearby</span>
            )}
            {totalHits > 0 && !isochroneActive && (
              <span className="text-[var(--color-sidebar-muted)]"> of {totalHits}</span>
            )}
          </p>
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
      </div>

      {/* Restaurant list */}
      <div className="space-y-2 px-4 pb-4">
        {sortedRestaurants.map((restaurant, i) => {
          const key = restaurant.objectID;
          const pinIndex = restaurantToPinIndex.get(i);
          const isSelected = pinIndex != null && pinIndex === selectedDiscoverIndex;
          const travelTime = getTravelTime(restaurant);
          return (
            <div
              key={key}
              ref={(el) => {
                if (el) cardRefs.current.set(i, el);
                else cardRefs.current.delete(i);
              }}
              className="animate-fade-slide-in scroll-mt-12"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <MichelinRestaurantCard
                restaurant={restaurant}
                status={addStatuses[key] || "idle"}
                error={errors[key] || null}
                alreadyInList={isAlreadyInList(restaurant)}
                onAdd={() => handleAdd(restaurant, i)}
                isSelected={isSelected}
                onClick={() => handleSelectRestaurant(i, restaurant)}
                travelTime={travelTime}
              />
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {page < totalPages - 1 && !isochroneActive && (
        <div className="px-4 pb-4">
          <button
            onClick={() => fetchRestaurants(page + 1, false)}
            disabled={loadingMore}
            className="w-full rounded-lg bg-[var(--color-sidebar-surface)] py-2 text-xs font-semibold text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)] disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
                Loading...
              </span>
            ) : (
              "Load more"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function buildDistinctionNotes(restaurant: MichelinRestaurant): string {
  const parts: string[] = [];
  if (restaurant.stars > 0) {
    parts.push(`${restaurant.stars} Michelin Star${restaurant.stars > 1 ? "s" : ""}`);
  } else if (restaurant.distinction === "BIB_GOURMAND" || restaurant.distinction === "bib_gourmand") {
    parts.push("Bib Gourmand");
  } else {
    parts.push("Michelin Selected");
  }
  if (restaurant.greenStar) parts.push("Green Star");
  return parts.join(", ");
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Sidebar, {
  Filters,
  DEFAULT_FILTERS,
  applyFilters,
} from "@/components/Sidebar";
import PlaceDetail from "@/components/PlaceDetail";
import AddPlaceModal from "@/components/AddPlaceModal";
import ManageTagsModal from "@/components/ManageTagsModal";
import IsochroneControl, {
  IsochroneSettings,
  TIME_STEPS,
} from "@/components/IsochroneControl";
import MobileBottomSheet from "@/components/MobileBottomSheet";
import { Place, Tag } from "@/lib/types";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: number[][]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1],
      yi = polygon[i][0];
    const xj = polygon[j][1],
      yj = polygon[j][0];
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPlaceInIsochrone(
  place: Place,
  geoJson: GeoJSON.FeatureCollection
): boolean {
  for (const feature of geoJson.features) {
    if (feature.geometry.type === "Polygon") {
      const coords = feature.geometry.coordinates[0] as number[][];
      if (isPointInPolygon(place.lat, place.lng, coords)) return true;
    }
  }
  return false;
}

export interface TravelTimeBand {
  minutes: number;
  color: string;
}

function getTravelTimeBand(
  place: Place,
  geoJson: GeoJSON.FeatureCollection
): TravelTimeBand | null {
  let best: TravelTimeBand | null = null;
  for (const feature of geoJson.features) {
    const props = feature.properties as { minutes: number; color: string } | null;
    if (!props) continue;
    if (feature.geometry.type === "Polygon") {
      const coords = feature.geometry.coordinates[0] as number[][];
      if (isPointInPolygon(place.lat, place.lng, coords)) {
        if (!best || props.minutes < best.minutes) {
          best = { minutes: props.minutes, color: props.color };
        }
      }
    }
  }
  return best;
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);

  // Isochrone state
  const [isoSettings, setIsoSettings] = useState<IsochroneSettings>({
    active: false,
    lat: null,
    lng: null,
    mode: "walking",
  });
  const [isoGeoJson, setIsoGeoJson] =
    useState<GeoJSON.FeatureCollection | null>(null);
  const [isoLoading, setIsoLoading] = useState(false);

  // Review state: places needing attention (closed or stale)
  const [reviewClosed, setReviewClosed] = useState<Place[]>([]);
  const [reviewStale, setReviewStale] = useState<Place[]>([]);

  const fetchPlaces = useCallback(async () => {
    const res = await fetch("/api/places");
    const data = await res.json();
    setPlaces(data);
  }, []);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data);
  }, []);

  const fetchReview = useCallback(async () => {
    try {
      const res = await fetch("/api/places/needs-review");
      const data = await res.json();
      setReviewClosed(data.closed || []);
      setReviewStale(data.stale || []);
    } catch {
      // Silently fail — review banner is non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPlaces(), fetchTags(), fetchReview()]).finally(() =>
      setLoading(false)
    );
  }, [fetchPlaces, fetchTags, fetchReview]);

  const filteredPlaces = useMemo(() => {
    let result = applyFilters(places, filters);
    if (isoGeoJson) {
      result = result.filter((p) => isPlaceInIsochrone(p, isoGeoJson));
    }
    return result;
  }, [places, filters, isoGeoJson]);

  const travelTimes = useMemo(() => {
    const map = new Map<number, TravelTimeBand>();
    if (!isoGeoJson) return map;
    for (const place of filteredPlaces) {
      const band = getTravelTimeBand(place, isoGeoJson);
      if (band) map.set(place.id, band);
    }
    return map;
  }, [filteredPlaces, isoGeoJson]);

  function handleSelectPlace(place: Place | null) {
    setSelectedPlace(place);
    setShowDetail(!!place);
  }

  function handleUpdatePlace(updated: Place) {
    setPlaces((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    setSelectedPlace((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
  }

  function handleDeletePlace(id: number) {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setSelectedPlace(null);
    setShowDetail(false);
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const tag = await res.json();
    setTags((prev) => [...prev, tag]);
    return tag;
  }

  async function handleUpdateTag(
    id: number,
    data: { name?: string; color?: string }
  ) {
    const res = await fetch("/api/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const updated = await res.json();
    setTags((prev) => prev.map((t) => (t.id === id ? updated : t)));
    // Update tags embedded in places
    setPlaces((prev) =>
      prev.map((p) => ({
        ...p,
        tags: p.tags.map((t) => (t.id === id ? updated : t)),
      }))
    );
  }

  async function handleDeleteTag(id: number) {
    await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
    setTags((prev) => prev.filter((t) => t.id !== id));
    // Remove deleted tag from places
    setPlaces((prev) =>
      prev.map((p) => ({
        ...p,
        tags: p.tags.filter((t) => t.id !== id),
      }))
    );
    // Remove from active filters
    setFilters((prev) => ({
      ...prev,
      tagIds: prev.tagIds.filter((tid) => tid !== id),
    }));
  }

  async function handleReviewArchive(id: number) {
    await fetch("/api/places", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "archived" }),
    });
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "archived" } : p))
    );
    setReviewClosed((prev) => prev.filter((p) => p.id !== id));
    setReviewStale((prev) => prev.filter((p) => p.id !== id));
  }

  function handleReviewDismissClosed(id: number) {
    // Clear the closedPermanently flag so it doesn't show up again
    fetch("/api/places", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, closedPermanently: false }),
    });
    setPlaces((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, closedPermanently: false } : p
      )
    );
    setReviewClosed((prev) => prev.filter((p) => p.id !== id));
  }

  function handleMapClick(lat: number, lng: number) {
    if (isoSettings.active) {
      setIsoSettings((prev) => ({ ...prev, lat, lng }));
      setIsoGeoJson(null);
    }
  }

  async function fetchIsochrone() {
    if (!isoSettings.lat || !isoSettings.lng) return;
    setIsoLoading(true);
    try {
      const res = await fetch("/api/isochrone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: isoSettings.lat,
          lng: isoSettings.lng,
          mode: isoSettings.mode,
          minutesList: TIME_STEPS[isoSettings.mode],
        }),
      });
      const data = await res.json();
      setIsoGeoJson(data);
    } finally {
      setIsoLoading(false);
    }
  }

  function clearIsochrone() {
    setIsoGeoJson(null);
    setIsoSettings((prev) => ({ ...prev, lat: null, lng: null }));
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsoSettings((prev) => ({
          ...prev,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
      },
      () => alert("Could not get your location")
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-parchment)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
          <p
            className="text-sm text-[var(--color-ink-muted)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Loading your places...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="hidden w-[360px] shrink-0 md:block">
        <Sidebar
          places={places}
          tags={tags}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onOpenAdd={() => setShowAddModal(true)}
          filters={filters}
          onFiltersChange={setFilters}
          onManageTags={() => setShowManageTags(true)}
          travelTimes={travelTimes}
          reviewClosed={reviewClosed}
          reviewStale={reviewStale}
          onReviewArchive={handleReviewArchive}
          onReviewDismissClosed={handleReviewDismissClosed}
        />
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapView
          places={filteredPlaces}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onMapClick={handleMapClick}
          isochroneGeoJson={isoGeoJson}
          isochroneOrigin={
            isoSettings.lat && isoSettings.lng
              ? { lat: isoSettings.lat, lng: isoSettings.lng }
              : null
          }
          travelTimes={travelTimes}
        />

        {/* Isochrone controls */}
        <div className="absolute left-3 top-3 z-10">
          <IsochroneControl
            settings={isoSettings}
            onChange={setIsoSettings}
            loading={isoLoading}
            onFetch={fetchIsochrone}
            onClear={clearIsochrone}
            onUseLocation={useMyLocation}
            hasIsochrone={!!isoGeoJson}
          />
        </div>

        {/* Mobile: Add FAB */}
        <button
          onClick={() => setShowAddModal(true)}
          className="absolute bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-amber)] text-xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-[var(--color-amber-light)] active:scale-95 md:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Place Detail Slide-over */}
      {showDetail && selectedPlace && (
        <div className="hidden w-[380px] shrink-0 md:block">
          <PlaceDetail
            place={selectedPlace}
            onClose={() => {
              setShowDetail(false);
              setSelectedPlace(null);
            }}
            onUpdate={handleUpdatePlace}
            onDelete={handleDeletePlace}
            tags={tags}
            onCreateTag={handleCreateTag}
          />
        </div>
      )}

      {/* Mobile: Place list bottom sheet */}
      {!showDetail && (
        <MobileBottomSheet
          places={filteredPlaces}
          tags={tags}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onOpenAdd={() => setShowAddModal(true)}
          filters={filters}
          onFiltersChange={setFilters}
          onManageTags={() => setShowManageTags(true)}
          travelTimes={travelTimes}
          reviewClosed={reviewClosed}
          reviewStale={reviewStale}
          onReviewArchive={handleReviewArchive}
          onReviewDismissClosed={handleReviewDismissClosed}
        />
      )}

      {/* Mobile: Place detail bottom sheet */}
      {showDetail && selectedPlace && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[var(--color-parchment)] shadow-xl md:hidden parchment-scroll">
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-[#d4c9bb]" />
          </div>
          <PlaceDetail
            place={selectedPlace}
            onClose={() => {
              setShowDetail(false);
              setSelectedPlace(null);
            }}
            onUpdate={handleUpdatePlace}
            onDelete={handleDeletePlace}
            tags={tags}
            onCreateTag={handleCreateTag}
          />
        </div>
      )}

      {/* Add Place Modal */}
      <AddPlaceModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={fetchPlaces}
        tags={tags}
        existingPlaces={places}
        onCreateTag={handleCreateTag}
      />

      {/* Manage Tags Modal */}
      <ManageTagsModal
        open={showManageTags}
        onClose={() => setShowManageTags(false)}
        tags={tags}
        onUpdateTag={handleUpdateTag}
        onDeleteTag={handleDeleteTag}
      />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Place, Tag, City, Cuisine, List } from "@/lib/types";
import { isInIsochrone, getTravelTimeBand, type TravelTimeBand } from "@/lib/geo";
import {
  CITIES_WITH_NEIGHBORHOODS,
  getCitySlug,
  fetchNeighborhoodGeoJson,
} from "@/lib/neighborhoods";
export type { TravelTimeBand } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [activeTab, setActiveTab] = useState<"places" | "discover" | "lists">("places");
  const [buildingListId, setBuildingListIdRaw] = useState<number | null>(null);
  const [viewingListId, setViewingListId] = useState<number | null>(null);

  const setBuildingListId = useCallback((id: number | null) => {
    setBuildingListIdRaw(id);
    if (id !== null) {
      setActiveTab("places");
    } else {
      setActiveTab("lists");
    }
  }, []);
  const [loading, setLoading] = useState(true);

  // Preview pin from AddPlaceModal
  const [previewPin, setPreviewPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  // Discover pins from Infatuation guides
  const [discoverPins, setDiscoverPins] = useState<{ lat: number; lng: number; name: string; rating: number | null; alreadyInList: boolean; matchedPlaceId: number | null }[]>([]);
  const [selectedDiscoverIndex, setSelectedDiscoverIndex] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 40.735, lng: -73.99 });

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

  // Neighborhood overlay state
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [neighborhoodGeoJson, setNeighborhoodGeoJson] =
    useState<GeoJSON.FeatureCollection | null>(null);

  const fetchPlaces = useCallback(async () => {
    const res = await fetch("/api/places");
    const data = await res.json();
    setPlaces(data);
  }, []);

  // Optimistically add a newly-created place to local state
  const handleDiscoverPlaceAdded = useCallback((newPlace: Place) => {
    setPlaces((prev) => {
      // Avoid duplicates if background refresh already added it
      if (prev.some((p) => p.id === newPlace.id)) return prev;
      return [...prev, newPlace];
    });
    // Background refresh to get any data we may be missing
    fetchPlaces();
  }, [fetchPlaces]);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data);
  }, []);

  const fetchCuisines = useCallback(async () => {
    const res = await fetch("/api/cuisines");
    const data = await res.json();
    setCuisines(data);
  }, []);

  const fetchCities = useCallback(async () => {
    const res = await fetch("/api/cities");
    const data = await res.json();
    setCities(data);
  }, []);

  const fetchLists = useCallback(async () => {
    const res = await fetch("/api/lists");
    const data = await res.json();
    setLists(data);
  }, []);


  // Detect viewport to avoid mounting DiscoverPanel in both Sidebar and MobileBottomSheet
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const geolocatedRef = useRef(false);

  useEffect(() => {
    Promise.all([fetchPlaces(), fetchTags(), fetchCuisines(), fetchCities(), fetchLists()]).finally(
      () => setLoading(false)
    );
  }, [fetchPlaces, fetchTags, fetchCuisines, fetchCities, fetchLists]);

  // On mount, geolocate user and fly map + auto-select closest city
  useEffect(() => {
    if (geolocatedRef.current) return;
    // Wait for cities to load before geolocating
    if (cities.length === 0) return;
    geolocatedRef.current = true;

    const findClosestCity = (lat: number, lng: number): City | null => {
      let closest: City | null = null;
      let closestDist = Infinity;
      for (const city of cities) {
        const dLat = city.lat - lat;
        const dLng = city.lng - lng;
        const dist = dLat * dLat + dLng * dLng;
        if (dist < closestDist) {
          closestDist = dist;
          closest = city;
        }
      }
      return closest;
    };

    const selectCity = (city: City) => {
      setSelectedCityId(city.id);
      setFlyTo({ lat: city.lat, lng: city.lng, zoom: 12 });
    };

    // Default to New York immediately
    const ny = cities.find((c) => c.name === "New York");
    if (ny) selectCity(ny);

    // Then override with closest city if geolocation succeeds
    const geolocate = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const closest = findClosestCity(pos.coords.latitude, pos.coords.longitude);
          if (closest) selectCity(closest);
        },
        () => {} // Geolocation denied — keep New York
      );
    };

    if (navigator.geolocation) {
      geolocate();

      // Re-run if the user grants permission later
      navigator.permissions?.query({ name: "geolocation" }).then((status) => {
        status.addEventListener("change", () => {
          if (status.state === "granted") geolocate();
        });
      });
    }
  }, [cities]);

  // Reset to places tab when city doesn't have discover
  const selectedCity = useMemo(
    () => (selectedCityId ? cities.find((c) => c.id === selectedCityId) : null),
    [selectedCityId, cities]
  );
  useEffect(() => {
    if (!selectedCity?.infatuationSlug && activeTab === "discover") {
      setActiveTab("places");
    }
  }, [selectedCity, activeTab]);

  const cityHasNeighborhoods = selectedCity
    ? CITIES_WITH_NEIGHBORHOODS.includes(getCitySlug(selectedCity.name))
    : false;

  // Fetch neighborhood GeoJSON when toggled on + city changes
  useEffect(() => {
    if (!showNeighborhoods || !selectedCity) {
      setNeighborhoodGeoJson(null);
      return;
    }
    const slug = getCitySlug(selectedCity.name);
    fetchNeighborhoodGeoJson(slug).then(setNeighborhoodGeoJson);
  }, [showNeighborhoods, selectedCity]);


  // Clear discover pins when switching to places tab
  const tabMountedRef = useRef(false);
  useEffect(() => {
    if (!tabMountedRef.current) {
      tabMountedRef.current = true;
      return;
    }
    if (activeTab !== "discover") {
      setDiscoverPins([]);
      setSelectedDiscoverIndex(null);
    }
    if (activeTab !== "lists") {
      setViewingListId(null);
    }
  }, [activeTab]);

  const filteredPlaces = useMemo(() => {
    let result = places;
    if (selectedCityId !== null) {
      result = result.filter((p) => p.cityId === selectedCityId);
    }
    result = applyFilters(result, filters);
    if (isoGeoJson) {
      result = result.filter((p) => isInIsochrone(p.lat, p.lng, isoGeoJson));
    }
    return result;
  }, [places, selectedCityId, filters, isoGeoJson]);

  // When viewing a list (not in build mode), only show those places on the map
  const mapPlaces = useMemo(() => {
    if (activeTab === "lists" && viewingListId && !buildingListId) {
      return filteredPlaces.filter((p) => p.listIds?.includes(viewingListId));
    }
    return filteredPlaces;
  }, [filteredPlaces, activeTab, viewingListId, buildingListId]);

  const travelTimes = useMemo(() => {
    const map = new Map<number, TravelTimeBand>();
    if (!isoGeoJson) return map;
    for (const place of filteredPlaces) {
      const band = getTravelTimeBand(place.lat, place.lng, isoGeoJson);
      if (band) map.set(place.id, band);
    }
    return map;
  }, [filteredPlaces, isoGeoJson]);

  function handleCityChange(cityId: number | null) {
    setSelectedCityId(cityId);
    // Clear neighborhood filter when changing city since neighborhoods are city-scoped
    setFilters((prev) => ({ ...prev, neighborhood: "" }));
    if (cityId !== null) {
      const city = cities.find((c) => c.id === cityId);
      if (city) {
        setFlyTo({ lat: city.lat, lng: city.lng, zoom: 12 });
      }
    }
  }

  function handleSelectPlace(place: Place | null) {
    setSelectedPlace(place);
    setShowDetail(!!place);
    if (place) {
      setFlyTo({ lat: place.lat, lng: place.lng });
    }
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


  async function handleCreateList(name: string): Promise<List> {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const list = await res.json();
    setLists((prev) => [...prev, list]);
    return list;
  }

  async function handleRenameList(id: number, name: string) {
    const res = await fetch("/api/lists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    const updated = await res.json();
    setLists((prev) => prev.map((l) => (l.id === id ? updated : l)));
  }

  async function handleDeleteList(id: number) {
    await fetch(`/api/lists?id=${id}`, { method: "DELETE" });
    setLists((prev) => prev.filter((l) => l.id !== id));
    // Remove list from all places' listIds
    setPlaces((prev) =>
      prev.map((p) => ({
        ...p,
        listIds: p.listIds.filter((lid) => lid !== id),
      }))
    );
    // Clear filter if the deleted list was active
    setFilters((prev) =>
      prev.listId === id ? { ...prev, listId: null } : prev
    );
    // Exit build mode if building this list
    if (buildingListId === id) setBuildingListId(null);
  }

  async function handleTogglePlaceInList(placeId: number, listId: number) {
    const place = places.find((p) => p.id === placeId);
    if (!place) return;
    const isInList = place.listIds.includes(listId);

    // Optimistic update
    const updateListIds = (p: Place) =>
      p.id === placeId
        ? {
            ...p,
            listIds: isInList
              ? p.listIds.filter((lid) => lid !== listId)
              : [...p.listIds, listId],
          }
        : p;
    setPlaces((prev) => prev.map(updateListIds));
    setSelectedPlace((prev) => (prev ? updateListIds(prev) : prev));

    try {
      if (isInList) {
        await fetch("/api/lists/places", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId, listId }),
        });
      } else {
        await fetch("/api/lists/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId, listId }),
        });
      }
    } catch {
      // Revert on failure
      setPlaces((prev) =>
        prev.map((p) =>
          p.id === placeId ? { ...p, listIds: place.listIds } : p
        )
      );
      setSelectedPlace((prev) =>
        prev?.id === placeId ? { ...prev, listIds: place.listIds } : prev
      );
    }
  }

  function handleSelectDiscoverIndex(index: number | null) {
    setSelectedDiscoverIndex(index);
    if (index != null && discoverPins[index]) {
      const pin = discoverPins[index];
      setFlyTo({ lat: pin.lat, lng: pin.lng });
      // Open detail for "already in list" places
      if (pin.alreadyInList && pin.matchedPlaceId) {
        const match = places.find((p) => p.id === pin.matchedPlaceId);
        if (match) {
          setSelectedPlace(match);
          setShowDetail(true);
          return;
        }
      }
    }
    // Close detail panel when selecting a non-matched pin or deselecting
    if (showDetail) {
      setShowDetail(false);
      setSelectedPlace(null);
    }
  }

  function handleDiscoverPinsChange(pins: { lat: number; lng: number; name: string; rating: number | null; alreadyInList: boolean; matchedPlaceId: number | null }[]) {
    setDiscoverPins(pins);
  }

  function handlePlacePreview(location: { lat: number; lng: number; name: string } | null) {
    setPreviewPin(location);
    if (location) {
      setFlyTo({ lat: location.lat, lng: location.lng });
    } else {
      setFlyTo(null);
    }
  }

  function handleMapClick(lat: number, lng: number) {
    // Deselect discover pin on map click
    if (selectedDiscoverIndex != null) {
      setSelectedDiscoverIndex(null);
    }
    // Close detail panel and deselect place on blank map click
    if (showDetail || selectedPlace) {
      setShowDetail(false);
      setSelectedPlace(null);
    }
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
          places={filteredPlaces}
          tags={tags}
          cuisines={cuisines}
          cities={cities}
          lists={lists}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onOpenAdd={() => setShowAddModal(true)}
          filters={filters}
          onFiltersChange={setFilters}
          onManageTags={() => setShowManageTags(true)}
          travelTimes={travelTimes}
          selectedCityId={selectedCityId}
          onCityChange={handleCityChange}
          isochroneActive={!!isoGeoJson}
          isoGeoJson={isoGeoJson}
          allPlaces={places}
          onPlaceAdded={handleDiscoverPlaceAdded}
          onDiscoverPinsChange={isMobile ? undefined : handleDiscoverPinsChange}
          selectedDiscoverIndex={isMobile ? undefined : selectedDiscoverIndex}
          onSelectDiscoverIndex={isMobile ? undefined : handleSelectDiscoverIndex}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          buildingListId={buildingListId}
          onBuildingListIdChange={setBuildingListId}
          onCreateList={handleCreateList}
          onRenameList={handleRenameList}
          onDeleteList={handleDeleteList}
          onTogglePlaceInList={handleTogglePlaceInList}
          viewingListId={viewingListId}
          onViewingListIdChange={setViewingListId}
        />
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapView
          places={mapPlaces}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onMapClick={handleMapClick}
          onMoveEnd={setMapCenter}
          isochroneGeoJson={isoGeoJson}
          isochroneOrigin={
            isoSettings.lat && isoSettings.lng
              ? { lat: isoSettings.lat, lng: isoSettings.lng }
              : null
          }
          travelTimes={travelTimes}
          flyTo={flyTo}
          previewPin={previewPin}
          showDetail={showDetail}
          discoverPins={discoverPins}
          selectedDiscoverIndex={selectedDiscoverIndex}
          onSelectDiscoverPin={handleSelectDiscoverIndex}
          buildingListId={buildingListId}
          onTogglePlaceInList={handleTogglePlaceInList}
          neighborhoodGeoJson={neighborhoodGeoJson}
        />

        {/* Map overlay controls */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <IsochroneControl
              settings={isoSettings}
              onChange={setIsoSettings}
              loading={isoLoading}
              onFetch={fetchIsochrone}
              onClear={clearIsochrone}
              onUseLocation={useMyLocation}
              hasIsochrone={!!isoGeoJson}
              mapCenter={mapCenter}
            />
            {cityHasNeighborhoods && (
              <button
                onClick={() => setShowNeighborhoods((v) => !v)}
                title="Toggle neighborhoods"
                className={`flex h-[38px] w-[38px] items-center justify-center rounded-lg transition-colors ${
                  showNeighborhoods
                    ? "bg-[var(--color-amber)] text-white"
                    : "border border-[#e0d6ca] bg-[var(--color-parchment)] text-[var(--color-ink-muted)] hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
                }`}
                style={{ boxShadow: "var(--shadow-float)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
            )}
          </div>
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
            cuisines={cuisines}
            lists={lists}
            onCreateTag={handleCreateTag}
            onCuisineCreated={fetchCuisines}
            onTogglePlaceInList={handleTogglePlaceInList}
            onCreateList={handleCreateList}
          />
        </div>
      )}

      {/* Mobile: Place list bottom sheet — always mounted to preserve DiscoverPanel state */}
      <div className={showDetail ? "hidden" : ""}>
        <MobileBottomSheet
          places={filteredPlaces}
          tags={tags}
          cuisines={cuisines}
          cities={cities}
          lists={lists}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          onOpenAdd={() => setShowAddModal(true)}
          filters={filters}
          onFiltersChange={setFilters}
          onManageTags={() => setShowManageTags(true)}
          travelTimes={travelTimes}
          selectedCityId={selectedCityId}
          onCityChange={handleCityChange}
          isochroneActive={!!isoGeoJson}
          isoGeoJson={isoGeoJson}
          allPlaces={places}
          onPlaceAdded={handleDiscoverPlaceAdded}
          onDiscoverPinsChange={isMobile ? handleDiscoverPinsChange : undefined}
          selectedDiscoverIndex={isMobile ? selectedDiscoverIndex : undefined}
          onSelectDiscoverIndex={isMobile ? handleSelectDiscoverIndex : undefined}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          buildingListId={buildingListId}
          onBuildingListIdChange={setBuildingListId}
          onCreateList={handleCreateList}
          onRenameList={handleRenameList}
          onDeleteList={handleDeleteList}
          onTogglePlaceInList={handleTogglePlaceInList}
          viewingListId={viewingListId}
          onViewingListIdChange={setViewingListId}
        />
      </div>

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
            cuisines={cuisines}
            lists={lists}
            onCreateTag={handleCreateTag}
            onCuisineCreated={fetchCuisines}
            onTogglePlaceInList={handleTogglePlaceInList}
            onCreateList={handleCreateList}
          />
        </div>
      )}

      {/* Add Place Modal */}
      <AddPlaceModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={fetchPlaces}
        tags={tags}
        cities={cities}
        existingPlaces={places}
        onCreateTag={handleCreateTag}
        onCityCreated={fetchCities}
        onPlacePreview={handlePlacePreview}
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

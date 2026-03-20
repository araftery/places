"use client";

import { useState, useEffect, useRef } from "react";
import {
  Tag,
  Place,
  City,
  GoogleSuggestion,
  GooglePlaceDetails,
  PLACE_TYPES,
  GOOGLE_TO_DEFAULT_PLACE_TYPE,
  RESERVATION_PROVIDERS,
} from "@/lib/types";

interface AddPlaceInlineProps {
  suggestion: GoogleSuggestion;
  tags: Tag[];
  cities: City[];
  existingPlaces: Place[];
  onCreateTag: (name: string) => Promise<Tag>;
  onCityCreated: () => void;
  onPlacePreview: (
    location: { lat: number; lng: number; name: string } | null
  ) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function AddPlaceInline({
  suggestion,
  tags,
  cities,
  existingPlaces,
  onCreateTag,
  onCityCreated,
  onPlacePreview,
  onSave,
  onCancel,
}: AddPlaceInlineProps) {
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const [placeType, setPlaceType] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);
  const [reservationProvider, setReservationProvider] = useState("");

  const [showNewCity, setShowNewCity] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newCityCountry, setNewCityCountry] = useState("US");
  const [creatingCity, setCreatingCity] = useState(false);
  const [cityWarning, setCityWarning] = useState<string | null>(null);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    lookupDetails();
  }, []);

  useEffect(() => {
    return () => {
      onPlacePreview(null);
    };
  }, []);

  async function lookupDetails() {
    setLoadingDetails(true);
    setDuplicateWarning(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: suggestion.placePrediction.placeId,
        }),
      });
      const data: GooglePlaceDetails = await res.json();
      setDetails(data);
      onPlacePreview({ lat: data.lat, lng: data.lng, name: data.name });

      const existing = existingPlaces.find(
        (p) => p.googlePlaceId === data.googlePlaceId
      );
      if (existing) {
        setDuplicateWarning(
          `"${existing.name}" is already in your list${existing.archived ? " (archived)" : ""}`
        );
      }

      if (data.primaryType && GOOGLE_TO_DEFAULT_PLACE_TYPE[data.primaryType]) {
        setPlaceType(GOOGLE_TO_DEFAULT_PLACE_TYPE[data.primaryType]);
      } else {
        const fallback = data.types?.find(
          (t: string) => GOOGLE_TO_DEFAULT_PLACE_TYPE[t]
        );
        if (fallback) setPlaceType(GOOGLE_TO_DEFAULT_PLACE_TYPE[fallback]);
      }

      if (data.neighborhood) setNeighborhood(data.neighborhood);

      if (data.lat && data.lng) {
        try {
          const closestRes = await fetch(
            `/api/cities/closest?lat=${data.lat}&lng=${data.lng}`
          );
          const closestData = await closestRes.json();
          if (closestData.city) {
            setCityId(closestData.city.id);
            setShowNewCity(false);
          } else {
            setCityId(null);
            if (data.city) {
              setNewCityName(data.city);
              setShowNewCity(true);
            }
          }
        } catch {
          // Silently fail city auto-detection
        }
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleCreateCity() {
    if (!newCityName.trim()) return;
    setCityWarning(null);
    setCreatingCity(true);
    try {
      const res = await fetch("/api/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCityName.trim(),
          country: newCityCountry || "US",
          placeLat: details?.lat,
          placeLng: details?.lng,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setCityWarning(err.error || "Failed to create city");
        return;
      }
      const newCity = await res.json();

      if (
        newCity.geocodedName &&
        newCity.geocodedName.toLowerCase() !== newCityName.trim().toLowerCase()
      ) {
        setCityWarning(
          `Google resolved "${newCityName.trim()}" to "${newCity.geocodedName}"`
        );
      }

      setCityId(newCity.id);
      setShowNewCity(false);
      setNewCityName("");
      setNewCityCountry("US");
      onCityCreated();
    } finally {
      setCreatingCity(false);
    }
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await onCreateTag(newTagName.trim());
    setSelectedTagIds((prev) => [...prev, tag.id]);
    setNewTagName("");
  }

  async function handleSave() {
    if (!details) return;
    setSaving(true);
    try {
      await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: details.name,
          address: details.address,
          lat: details.lat,
          lng: details.lng,
          cityId: cityId || null,
          neighborhood: neighborhood || null,
          placeType: placeType || null,
          googlePlaceType: details.googlePlaceType,
          priceRange: details.priceRange,
          websiteUrl: details.websiteUrl,
          phone: details.phone,
          personalNotes: notes || null,
          source: source || null,
          googlePlaceId: details.googlePlaceId,
          hoursJson: details.hoursJson,
          tagIds: selectedTagIds,
          googleRating: details.googleRating,
          googleRatingCount: details.googleRatingCount,
          reservationProvider: reservationProvider || null,
        }),
      });
      onPlacePreview(null);
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-2 text-base md:text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none";
  const labelClass =
    "text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-muted)]";

  return (
    <div className="flex h-full flex-col">
      {/* Back header */}
      <div className="sticky top-0 z-10 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] px-4 py-3">
        <button
          onClick={() => {
            onPlacePreview(null);
            onCancel();
          }}
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-amber)] transition-colors hover:text-[var(--color-amber-light)]"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to search
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sidebar-scroll">
        <div className="space-y-4">
          {loadingDetails && (
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--color-sidebar-muted)]">
                Loading place details...
              </p>
            </div>
          )}

          {details && (
            <>
              {/* Place preview card */}
              <div className="rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-3.5">
                <p
                  className="font-medium text-[var(--color-sidebar-text)]"
                  style={{ fontFamily: "var(--font-libre-baskerville)" }}
                >
                  {details.name}
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-sidebar-muted)]">
                  {details.address}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
                  {details.googleRating && (
                    <span className="font-medium text-[var(--color-amber)]">
                      ★ {details.googleRating}/5
                      {details.googleRatingCount &&
                        ` (${details.googleRatingCount})`}
                    </span>
                  )}
                  {placeType && (
                    <span className="capitalize text-[var(--color-sidebar-muted)]">
                      {placeType.replace("_", " ")}
                    </span>
                  )}
                  {cityId && (
                    <span className="text-[var(--color-sidebar-muted)]">
                      {cities.find((c) => c.id === cityId)?.name}
                    </span>
                  )}
                </div>
              </div>

              {duplicateWarning && (
                <div className="rounded-lg border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/10 px-3.5 py-2.5 text-sm text-[var(--color-terracotta)]">
                  {duplicateWarning}
                </div>
              )}

              {/* Type */}
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={placeType}
                  onChange={(e) => setPlaceType(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  {PLACE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* City + Neighborhood */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  {!showNewCity ? (
                    <select
                      value={cityId ?? ""}
                      onChange={(e) => {
                        setCityWarning(null);
                        if (e.target.value === "__new__") {
                          setShowNewCity(true);
                          setCityId(null);
                        } else {
                          setCityId(
                            e.target.value ? parseInt(e.target.value) : null
                          );
                        }
                      }}
                      className={inputClass}
                    >
                      <option value="">Select...</option>
                      {(details
                        ? cities.filter((c) => {
                            const dLat = details.lat - c.lat;
                            const dLng = details.lng - c.lng;
                            return (
                              Math.sqrt(dLat * dLat + dLng * dLng) * 69 <= 50
                            );
                          })
                        : cities
                      ).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__new__">+ New city</option>
                    </select>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      <input
                        value={newCityName}
                        onChange={(e) => setNewCityName(e.target.value)}
                        className="block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-1.5 text-base md:text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                        placeholder="City name"
                        autoFocus
                        autoComplete="off"
                        data-1p-ignore
                      />
                      <input
                        value={newCityCountry}
                        onChange={(e) => setNewCityCountry(e.target.value)}
                        className="block w-full rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-1.5 text-base md:text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                        placeholder="Country code (US)"
                        autoComplete="off"
                        data-1p-ignore
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleCreateCity}
                          disabled={creatingCity || !newCityName.trim()}
                          className="rounded-md bg-[var(--color-amber)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--color-amber-light)] disabled:opacity-50"
                        >
                          {creatingCity ? "..." : "Create"}
                        </button>
                        <button
                          onClick={() => {
                            setShowNewCity(false);
                            setNewCityName("");
                            setNewCityCountry("US");
                          }}
                          className="text-xs text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Neighborhood</label>
                  <input
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {cityWarning && (
                <div className="rounded-lg border border-[var(--color-amber)]/30 bg-[var(--color-amber)]/10 px-3.5 py-2.5 text-sm text-[var(--color-amber)]">
                  {cityWarning}
                </div>
              )}

              {/* Tags */}
              <div>
                <label className={labelClass}>Tags</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setSelectedTagIds((prev) =>
                          prev.includes(tag.id)
                            ? prev.filter((id) => id !== tag.id)
                            : [...prev, tag.id]
                        )
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        selectedTagIds.includes(tag.id)
                          ? "text-white"
                          : "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                      }`}
                      style={
                        selectedTagIds.includes(tag.id)
                          ? { backgroundColor: tag.color }
                          : {}
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-1.5 text-base md:text-sm text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                    placeholder="New tag..."
                  />
                  <button
                    onClick={handleAddTag}
                    type="button"
                    className="rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>Personal Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder="John recommended, get the pasta..."
                />
              </div>

              {/* Source */}
              <div>
                <label className={labelClass}>Source</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={inputClass}
                  placeholder="How you heard about it"
                />
              </div>

              {/* Reservation Provider */}
              <div>
                <label className={labelClass}>Reservation Provider</label>
                <select
                  value={reservationProvider}
                  onChange={(e) => setReservationProvider(e.target.value)}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {RESERVATION_PROVIDERS.map((rp) => (
                    <option key={rp.value} value={rp.value}>
                      {rp.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save button */}
      {details && (
        <div className="border-t border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] p-4">
          <button
            onClick={handleSave}
            disabled={saving || !!duplicateWarning}
            className="w-full rounded-lg bg-[var(--color-amber)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-amber-light)] disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : duplicateWarning
                ? "Already in list"
                : "Add Place"}
          </button>
        </div>
      )}
    </div>
  );
}

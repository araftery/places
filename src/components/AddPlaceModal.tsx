"use client";

import { useState, useEffect, useRef } from "react";
import {
  Tag,
  Place,
  PLACE_TYPES,
  STATUS_OPTIONS,
  GOOGLE_TYPE_MAP,
} from "@/lib/types";

interface GoogleSuggestion {
  placePrediction: {
    placeId: string;
    text: { text: string };
    structuredFormat: {
      mainText: { text: string };
      secondaryText: { text: string };
    };
  };
}

interface PlaceDetails {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  websiteUrl: string | null;
  phone: string | null;
  priceRange: number | null;
  hoursJson: unknown;
  googleRating: number | null;
  googleRatingCount: number | null;
  primaryType: string | null;
  neighborhood: string | null;
  city: string | null;
  cuisineTypes: string[];
}

interface AddPlaceModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  tags: Tag[];
  existingPlaces: Place[];
  onCreateTag: (name: string) => Promise<Tag>;
}

export default function AddPlaceModal({
  open,
  onClose,
  onSave,
  tags,
  existingPlaces,
  onCreateTag,
}: AddPlaceModalProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GoogleSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Form fields
  const [status, setStatus] = useState("want_to_try");
  const [placeType, setPlaceType] = useState("");
  const [cuisineType, setCuisineType] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);

  // Track whether we're actively typing (vs having just selected a suggestion)
  const justSelectedRef = useRef(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    // Don't search if we just selected a suggestion (which updates query)
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search?input=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        setSuggestions(data);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  async function selectSuggestion(suggestion: GoogleSuggestion) {
    // Immediately clear suggestions and mark that we just selected
    setSuggestions([]);
    justSelectedRef.current = true;
    setQuery(suggestion.placePrediction.structuredFormat.mainText.text);
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
      const data: PlaceDetails = await res.json();
      setDetails(data);

      // Check for duplicate
      const existing = existingPlaces.find(
        (p) => p.googlePlaceId === data.googlePlaceId
      );
      if (existing) {
        setDuplicateWarning(
          `"${existing.name}" is already in your list (${existing.status.replace("_", " ")})`
        );
      }

      // Auto-fill type from Google
      if (data.primaryType && GOOGLE_TYPE_MAP[data.primaryType]) {
        setPlaceType(GOOGLE_TYPE_MAP[data.primaryType]);
      }

      // Auto-fill city and neighborhood from Google address components
      if (data.city) setCity(data.city);
      if (data.neighborhood) setNeighborhood(data.neighborhood);

      // Auto-fill cuisine from Google types
      if (data.cuisineTypes.length > 0) {
        setCuisineType(data.cuisineTypes.join(", "));
      }
    } finally {
      setLoadingDetails(false);
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
          city: city || null,
          neighborhood: neighborhood || null,
          placeType: placeType || null,
          cuisineType: cuisineType
            ? cuisineType.split(",").map((s) => s.trim())
            : null,
          priceRange: details.priceRange,
          websiteUrl: details.websiteUrl,
          phone: details.phone,
          status,
          personalNotes: notes || null,
          source: source || null,
          googlePlaceId: details.googlePlaceId,
          hoursJson: details.hoursJson,
          tagIds: selectedTagIds,
          googleRating: details.googleRating,
          googleRatingCount: details.googleRatingCount,
        }),
      });
      resetForm();
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setQuery("");
    setSuggestions([]);
    setDetails(null);
    setDuplicateWarning(null);
    setStatus("want_to_try");
    setPlaceType("");
    setCuisineType("");
    setCity("");
    setNeighborhood("");
    setNotes("");
    setSource("");
    setSelectedTagIds([]);
    setNewTagName("");
  }

  if (!open) return null;

  const inputClass =
    "mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none";
  const labelClass =
    "text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[5vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-ink)]/40 backdrop-blur-[2px]"
        onClick={() => {
          resetForm();
          onClose();
        }}
      />

      <div
        className="relative w-full max-w-lg rounded-xl border border-[#e0d6ca] bg-[var(--color-parchment)]"
        style={{ boxShadow: "var(--shadow-overlay)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-t-xl border-b border-[#e0d6ca] bg-[var(--color-parchment)] px-5 py-4">
          <h2
            className="text-lg text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Add Place
          </h2>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="rounded-md p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-parchment-dark)] hover:text-[var(--color-ink)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Google Places Search */}
          <div className="relative">
            <label className={labelClass}>Search for a place</label>
            <div className="relative mt-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
                width="14"
                height="14"
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="block w-full rounded-md border border-[#d4c9bb] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                placeholder="Search restaurants, bars, cafes..."
                autoFocus
              />
            </div>
            {searching && (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)] animate-warm-pulse">
                Searching...
              </p>
            )}
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#e0d6ca] bg-[var(--color-parchment)] shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.placePrediction.placeId}>
                    <button
                      onClick={() => selectSuggestion(s)}
                      className="w-full px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-cream)]"
                    >
                      <p className="text-sm font-medium text-[var(--color-ink)]">
                        {s.placePrediction.structuredFormat.mainText.text}
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {s.placePrediction.structuredFormat.secondaryText.text}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {loadingDetails && (
            <div className="flex items-center gap-2 py-2">
              <div className="h-4 w-4 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--color-ink-muted)]">
                Loading place details...
              </p>
            </div>
          )}

          {details && (
            <>
              {/* Place preview card */}
              <div className="rounded-lg border border-[#e0d6ca] bg-[var(--color-cream)] p-3.5">
                <p
                  className="font-medium text-[var(--color-ink)]"
                  style={{ fontFamily: "var(--font-libre-baskerville)" }}
                >
                  {details.name}
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                  {details.address}
                </p>
                {details.googleRating && (
                  <p className="mt-1.5 text-sm font-medium text-[var(--color-amber)]">
                    ★ {details.googleRating}/5
                    {details.googleRatingCount &&
                      ` (${details.googleRatingCount} reviews)`}
                  </p>
                )}
              </div>

              {/* Duplicate warning */}
              {duplicateWarning && (
                <div className="rounded-lg border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/10 px-3.5 py-2.5 text-sm text-[var(--color-terracotta)]">
                  {duplicateWarning}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass}
                  />
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

              <div>
                <label className={labelClass}>Cuisine (comma-separated)</label>
                <input
                  value={cuisineType}
                  onChange={(e) => setCuisineType(e.target.value)}
                  className={inputClass}
                  placeholder="Italian, Pizza"
                />
              </div>

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
                          : "border border-[#d4c9bb] bg-[var(--color-cream)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
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
                    className="flex-1 rounded-md border border-[#d4c9bb] bg-white px-3 py-1.5 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                    placeholder="New tag..."
                  />
                  <button
                    onClick={handleAddTag}
                    type="button"
                    className="rounded-md border border-[#d4c9bb] bg-[var(--color-cream)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    Add
                  </button>
                </div>
              </div>

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

              <div>
                <label className={labelClass}>Source</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={inputClass}
                  placeholder="How you heard about it"
                />
              </div>
            </>
          )}
        </div>

        {details && (
          <div className="sticky bottom-0 rounded-b-xl border-t border-[#e0d6ca] bg-[var(--color-parchment)] p-4">
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
    </div>
  );
}

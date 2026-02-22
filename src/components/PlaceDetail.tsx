"use client";

import { Place, STATUS_OPTIONS, PLACE_TYPES } from "@/lib/types";
import { generateReviewLinks } from "@/lib/review-links";
import { useState } from "react";

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
  onUpdate: (place: Place) => void;
  onDelete: (id: number) => void;
}

export default function PlaceDetail({
  place,
  onClose,
  onUpdate,
  onDelete,
}: PlaceDetailProps) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(place.status);
  const [notes, setNotes] = useState(place.personalNotes || "");
  const [source, setSource] = useState(place.source || "");
  const [saving, setSaving] = useState(false);

  // Manual rating entry
  const [addingRating, setAddingRating] = useState(false);
  const [ratingSource, setRatingSource] = useState("");
  const [ratingValue, setRatingValue] = useState("");
  const [ratingNotes, setRatingNotes] = useState("");
  const [ratingUrl, setRatingUrl] = useState("");

  const googleRating = place.ratings?.find((r) => r.source === "google");
  const otherRatings =
    place.ratings?.filter((r) => r.source !== "google") || [];
  const reviewLinks = generateReviewLinks(
    place.name,
    place.address,
    place.city
  );

  const hoursDescriptions =
    place.hoursJson &&
    typeof place.hoursJson === "object" &&
    "weekdayDescriptions" in (place.hoursJson as Record<string, unknown>)
      ? (place.hoursJson as { weekdayDescriptions: string[] })
          .weekdayDescriptions
      : null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/places", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: place.id,
          status,
          personalNotes: notes || null,
          source: source || null,
        }),
      });
      const updated = await res.json();
      onUpdate({ ...place, ...updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRating() {
    if (!ratingSource) return;
    const res = await fetch("/api/places/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId: place.id,
        source: ratingSource,
        rating: ratingValue || null,
        notes: ratingNotes || null,
        ratingUrl: ratingUrl || null,
      }),
    });
    if (res.ok) {
      const newRating = await res.json();
      onUpdate({
        ...place,
        ratings: [...place.ratings, newRating],
      });
      setAddingRating(false);
      setRatingSource("");
      setRatingValue("");
      setRatingNotes("");
      setRatingUrl("");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this place?")) return;
    await fetch(`/api/places?id=${place.id}`, { method: "DELETE" });
    onDelete(place.id);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-[#e0d6ca] bg-[var(--color-parchment)] parchment-scroll">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#e0d6ca] px-5 py-4">
        <h2
          className="text-lg leading-snug text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          {place.name}
        </h2>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 rounded-md p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-parchment-dark)] hover:text-[var(--color-ink)]"
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

      <div className="flex-1 space-y-5 px-5 py-5">
        {/* Address */}
        {place.address && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Address
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-ink)]">
              {place.address}
            </p>
          </div>
        )}

        {/* Info grid */}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {place.placeType && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Type
              </p>
              <p className="mt-0.5 text-sm capitalize text-[var(--color-ink)]">
                {PLACE_TYPES.find((t) => t.value === place.placeType)?.label ||
                  place.placeType}
              </p>
            </div>
          )}
          {place.priceRange && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Price
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">
                {PRICE_LABELS[place.priceRange]}
              </p>
            </div>
          )}
          {place.neighborhood && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Neighborhood
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">
                {place.neighborhood}
              </p>
            </div>
          )}
          {place.city && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                City
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">
                {place.city}
              </p>
            </div>
          )}
        </div>

        {place.cuisineType && place.cuisineType.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Cuisine
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-ink)]">
              {place.cuisineType.join(", ")}
            </p>
          </div>
        )}

        {/* Ratings */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Ratings
          </p>
          <div className="mt-1.5 space-y-1.5">
            {googleRating && (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-[var(--color-amber)]">
                  ★ {googleRating.rating}
                </span>
                <span className="text-[var(--color-ink-muted)]">Google</span>
                {googleRating.notes && (
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    ({googleRating.notes})
                  </span>
                )}
              </div>
            )}
            {otherRatings.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium capitalize text-[var(--color-ink)]">
                  {r.source}
                </span>
                {r.rating && (
                  <span className="text-[var(--color-ink-light)]">
                    {r.rating}
                  </span>
                )}
                {r.notes && (
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {r.notes}
                  </span>
                )}
                {r.ratingUrl && (
                  <a
                    href={r.ratingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-amber)] hover:text-[var(--color-amber-light)]"
                  >
                    Link
                  </a>
                )}
              </div>
            ))}

            {!addingRating ? (
              <button
                onClick={() => setAddingRating(true)}
                className="mt-1 text-xs font-medium text-[var(--color-amber)] hover:text-[var(--color-amber-light)]"
              >
                + Add rating
              </button>
            ) : (
              <div className="mt-2 space-y-2 rounded-lg border border-[#e0d6ca] bg-[var(--color-cream)] p-3">
                <input
                  value={ratingSource}
                  onChange={(e) => setRatingSource(e.target.value)}
                  placeholder="Source (e.g. michelin, nyt)"
                  className="block w-full rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                />
                <input
                  value={ratingValue}
                  onChange={(e) => setRatingValue(e.target.value)}
                  placeholder="Rating (e.g. 4.5/5, 1 star)"
                  className="block w-full rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                />
                <input
                  value={ratingNotes}
                  onChange={(e) => setRatingNotes(e.target.value)}
                  placeholder="Notes"
                  className="block w-full rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                />
                <input
                  value={ratingUrl}
                  onChange={(e) => setRatingUrl(e.target.value)}
                  placeholder="URL to review"
                  className="block w-full rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddRating}
                    className="rounded-md bg-[var(--color-amber)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-amber-light)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setAddingRating(false)}
                    className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {place.tags.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Tags
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {place.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded px-2 py-0.5 text-[11px] font-semibold text-white/90"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hours */}
        {hoursDescriptions && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Hours
            </p>
            <div className="mt-1.5 space-y-0.5">
              {hoursDescriptions.map((h: string, i: number) => (
                <p key={i} className="text-xs text-[var(--color-ink-light)]">
                  {h}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Editable fields */}
        <div className="border-t border-[#e0d6ca] pt-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-amber)] focus:outline-none"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                  placeholder="Personal notes..."
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Source
                </label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                  placeholder="How you heard about it..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-amber-light)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-[#d4c9bb] px-4 py-2 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-parchment-dark)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Status
                </p>
                <p className="mt-0.5 text-sm capitalize text-[var(--color-ink)]">
                  {STATUS_OPTIONS.find((s) => s.value === place.status)
                    ?.label || place.status}
                </p>
              </div>
              {place.personalNotes && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                    Notes
                  </p>
                  <p className="mt-0.5 text-sm italic text-[var(--color-ink-light)]">
                    {place.personalNotes}
                  </p>
                </div>
              )}
              {place.source && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                    Source
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-light)]">
                    {place.source}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action links */}
        <div className="flex flex-wrap gap-2 border-t border-[#e0d6ca] pt-4">
          {place.websiteUrl && (
            <a
              href={place.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[#d4c9bb] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Website
            </a>
          )}
          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              className="inline-flex items-center gap-1 rounded-md border border-[#d4c9bb] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Call
            </a>
          )}
          {place.menuUrl && (
            <a
              href={place.menuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[#d4c9bb] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Menu
            </a>
          )}
        </div>

        {/* Review source links */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Look up on
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reviewLinks.map((link) => (
              <a
                key={link.source}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-[#e0d6ca] px-5 py-3">
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex-1 rounded-md bg-[var(--color-cream)] px-3 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-parchment-dark)]"
            >
              Edit
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-terracotta)] transition-colors hover:bg-[var(--color-terracotta)]/10"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

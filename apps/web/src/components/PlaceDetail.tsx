"use client";

import { Place, Tag, PlaceRating, PLACE_TYPES } from "@/lib/types";
import { generateReviewLinks } from "@/lib/review-links";
import { formatRating, formatCount, getBestBlurb } from "@/lib/format-ratings";
import { useState } from "react";

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  nyt: "NYT",
  infatuation: "Infatuation",
  beli: "Beli",
};

const RATING_SOURCE_ORDER = ["google", "nyt", "infatuation", "beli"];

interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
  onUpdate: (place: Place) => void;
  onDelete: (id: number) => void;
  tags: Tag[];
  onCreateTag: (name: string) => Promise<Tag>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function formatReviewDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function RatingsTable({ ratings }: { ratings: PlaceRating[] }) {
  if (ratings.length === 0) return null;

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg bg-[var(--color-cream)]">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {ratings.map((r, i) => {
            const source = r.source;
            const label = SOURCE_LABELS[source] || source;
            const reviewDateStr = r.reviewDate ? formatReviewDate(r.reviewDate) : null;
            const isLast = i === ratings.length - 1;

            let ratingDisplay: React.ReactNode = (
              <span className="text-[var(--color-ink-muted)]">&mdash;</span>
            );
            if (r.rating != null && r.ratingMax != null) {
              if (source === "nyt") {
                ratingDisplay = (
                  <>
                    {r.rating}
                    <span className="text-[var(--color-amber)]">{"\u2605"}</span>
                  </>
                );
              } else {
                ratingDisplay = <>{formatRating(r.rating, r.ratingMax)}</>;
              }
            }

            let secondary: string | null = null;
            if (r.reviewCount != null) {
              secondary = formatCount(r.reviewCount);
            } else if (reviewDateStr) {
              secondary = reviewDateStr;
            }

            const isPick = source === "infatuation" && r.notes === "Critic's Pick";

            const rowContent = (
              <>
                {/* Rating + secondary stacked */}
                <td className="whitespace-nowrap py-2 pl-3 pr-2">
                  <div className="text-[13px] font-semibold leading-tight text-[var(--color-ink)]">
                    {ratingDisplay}
                  </div>
                  {secondary && (
                    <div className="mt-0.5 text-[10px] leading-tight text-[var(--color-ink-muted)]">
                      {secondary}
                    </div>
                  )}
                </td>
                {/* Spacer */}
                <td className="py-2"></td>
                {/* Provider name — right-aligned */}
                <td className="whitespace-nowrap py-2 pr-3 text-right text-xs font-medium text-[var(--color-ink-muted)]">
                  {label}
                  {isPick && (
                    <span className="ml-1.5 rounded bg-[var(--color-amber)]/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--color-amber)]">
                      Pick
                    </span>
                  )}
                </td>
              </>
            );

            if (r.ratingUrl) {
              return (
                <tr
                  key={r.id}
                  className={`cursor-pointer transition-colors hover:bg-[var(--color-parchment)]${isLast ? "" : " border-b border-[#e8e0d5]"}`}
                  onClick={() => window.open(r.ratingUrl!, "_blank", "noopener,noreferrer")}
                >
                  {rowContent}
                </tr>
              );
            }

            return (
              <tr
                key={r.id}
                className={isLast ? "" : "border-b border-[#e8e0d5]"}
              >
                {rowContent}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getTodayHours(
  weekdayDescriptions: string[]
): { dayName: string; hours: string } | null {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const today = dayNames[new Date().getDay()];

  for (const desc of weekdayDescriptions) {
    const colonIdx = desc.indexOf(": ");
    if (colonIdx === -1) continue;
    const day = desc.substring(0, colonIdx);
    const hours = desc.substring(colonIdx + 2);
    if (day === today) {
      return { dayName: day, hours };
    }
  }
  return null;
}

function parseHoursLine(desc: string): { day: string; hours: string } {
  const colonIdx = desc.indexOf(": ");
  if (colonIdx === -1) return { day: desc, hours: "" };
  return {
    day: desc.substring(0, colonIdx),
    hours: desc.substring(colonIdx + 2),
  };
}

export default function PlaceDetail({
  place,
  onClose,
  onUpdate,
  onDelete,
  tags,
  onCreateTag,
}: PlaceDetailProps) {
  const [editing, setEditing] = useState(false);
  const [beenThere, setBeenThere] = useState(place.beenThere);
  const [placeType, setPlaceType] = useState(place.placeType || "");
  const [notes, setNotes] = useState(place.personalNotes || "");
  const [source, setSource] = useState(place.source || "");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    place.tags.map((t) => t.id)
  );
  const [newTagName, setNewTagName] = useState("");
  const [saving, setSaving] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  // Manual rating entry
  const [addingRating, setAddingRating] = useState(false);
  const [ratingSource, setRatingSource] = useState("");
  const [ratingValue, setRatingValue] = useState("");
  const [ratingMaxValue, setRatingMaxValue] = useState("");
  const [ratingNotes, setRatingNotes] = useState("");
  const [ratingUrl, setRatingUrl] = useState("");

  const reviewLinks = generateReviewLinks(
    place.name,
    place.address,
    place.cityName
  );
  const blurb = getBestBlurb(place.ratings || []);

  const hoursDescriptions =
    place.hoursJson &&
    typeof place.hoursJson === "object" &&
    "weekdayDescriptions" in (place.hoursJson as Record<string, unknown>)
      ? (place.hoursJson as { weekdayDescriptions: string[] })
          .weekdayDescriptions
      : null;

  const todayHours = hoursDescriptions
    ? getTodayHours(hoursDescriptions)
    : null;

  // Compact info line: Type · $$$ · Neighborhood
  const infoLineParts: string[] = [];
  if (place.placeType) {
    const typeLabel =
      PLACE_TYPES.find((t) => t.value === place.placeType)?.label ||
      place.placeType;
    infoLineParts.push(typeLabel);
  }
  if (place.priceRange) {
    infoLineParts.push(PRICE_LABELS[place.priceRange]);
  }
  if (place.neighborhood) {
    infoLineParts.push(place.neighborhood);
  }

  // Sort ratings in canonical order
  const sortedRatings = [...(place.ratings || [])].sort((a, b) => {
    const ai = RATING_SOURCE_ORDER.indexOf(a.source);
    const bi = RATING_SOURCE_ORDER.indexOf(b.source);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const todayName = dayNames[new Date().getDay()];

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await onCreateTag(newTagName.trim());
    setSelectedTagIds((prev) => [...prev, tag.id]);
    setNewTagName("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/places", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: place.id,
          beenThere,
          placeType: placeType || null,
          personalNotes: notes || null,
          source: source || null,
          tagIds: selectedTagIds,
        }),
      });
      const updated = await res.json();
      const updatedTags = tags.filter((t) => selectedTagIds.includes(t.id));
      onUpdate({ ...place, ...updated, tags: updatedTags });
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
        rating: ratingValue ? parseFloat(ratingValue) : null,
        ratingMax: ratingMaxValue ? parseFloat(ratingMaxValue) : null,
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
      setRatingMaxValue("");
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
      <div className="border-b border-[#e0d6ca] px-5 py-4">
        <div className="flex items-start justify-between">
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
        {infoLineParts.length > 0 && (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {infoLineParts.join(" \u00b7 ")}
          </p>
        )}
        {place.cuisineType && place.cuisineType.length > 0 && (
          <p className="mt-0.5 text-sm text-[var(--color-ink-light)]">
            {place.cuisineType.join(", ")}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-5 px-5 py-5">
        {/* Closed warning */}
        {place.closedPermanently && (
          <div className="rounded-lg border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/5 px-3.5 py-2.5">
            <p className="text-xs font-semibold text-[var(--color-terracotta)]">
              Permanently Closed
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
              Google reports this place has permanently closed. Consider
              archiving it.
            </p>
          </div>
        )}

        {editing ? (
          /* ── Edit Mode ── */
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Been There
              </label>
              <button
                type="button"
                onClick={() => setBeenThere(!beenThere)}
                className={`mt-1 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  beenThere
                    ? "border-[var(--color-sage)] bg-[var(--color-sage)]/10 text-[var(--color-sage)]"
                    : "border-[#d4c9bb] bg-white text-[var(--color-ink-muted)]"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {beenThere ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                  )}
                </svg>
                {beenThere ? "Yes, I\u2019ve been here" : "Not yet"}
              </button>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Type
              </label>
              <select
                value={placeType}
                onChange={(e) => setPlaceType(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-amber)] focus:outline-none"
              >
                <option value="">None</option>
                {PLACE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Tags
              </label>
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
          </div>
        ) : (
          /* ── Read-Only Mode ── */
          <>
            {/* Been There indicator */}
            {place.beenThere && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-sage)]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Been There
              </div>
            )}

            {/* Editorial blurb */}
            {blurb && (
              <div className="border-l-2 border-[var(--color-amber)] pl-3.5">
                <p className="text-sm italic leading-relaxed text-[var(--color-ink-light)]">
                  &ldquo;{blurb.text}&rdquo;
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                  &mdash; {blurb.source}
                </p>
              </div>
            )}

            {/* Ratings */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Ratings
              </p>
              <RatingsTable ratings={sortedRatings} />
              <div className="mt-1.5">

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
                      placeholder="Source (e.g. michelin, zagat)"
                      className="block w-full rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        value={ratingValue}
                        onChange={(e) => setRatingValue(e.target.value)}
                        placeholder="Rating (e.g. 4.5)"
                        type="number"
                        step="0.1"
                        className="block flex-1 rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                      />
                      <input
                        value={ratingMaxValue}
                        onChange={(e) => setRatingMaxValue(e.target.value)}
                        placeholder="Max (e.g. 5)"
                        type="number"
                        step="1"
                        className="block w-20 rounded-md border border-[#d4c9bb] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                      />
                    </div>
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

            {/* Tags (no section label) */}
            {place.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {place.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-white/90"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Hours — collapsible */}
            {hoursDescriptions && (
              <div>
                <button
                  onClick={() => setHoursExpanded(!hoursExpanded)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                    Hours
                  </span>
                  {todayHours && !hoursExpanded && (
                    <span className="text-xs text-[var(--color-ink-light)]">
                      Today {todayHours.hours}
                    </span>
                  )}
                  <span className="ml-auto text-[var(--color-ink-muted)]">
                    <ChevronIcon expanded={hoursExpanded} />
                  </span>
                </button>
                {hoursExpanded && (
                  <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {hoursDescriptions.map((desc: string, i: number) => {
                      const { day, hours } = parseHoursLine(desc);
                      const isToday = day === todayName;
                      return (
                        <div key={i} className="col-span-2 grid grid-cols-subgrid">
                          <span
                            className={`text-xs ${
                              isToday
                                ? "font-semibold text-[var(--color-ink)]"
                                : "text-[var(--color-ink-muted)]"
                            }`}
                          >
                            {day}
                          </span>
                          <span
                            className={`text-xs ${
                              isToday
                                ? "font-semibold text-[var(--color-ink)]"
                                : "text-[var(--color-ink-light)]"
                            }`}
                          >
                            {hours}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Personal notes & source */}
            {(place.personalNotes || place.source) && (
              <div className="space-y-1.5 border-t border-[#e0d6ca] pt-4">
                {place.personalNotes && (
                  <p className="text-sm italic text-[var(--color-ink-light)]">
                    {place.personalNotes}
                  </p>
                )}
                {place.source && (
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Source: {place.source}
                  </p>
                )}
              </div>
            )}

            {/* Consolidated links */}
            <div className="flex flex-wrap gap-1.5 border-t border-[#e0d6ca] pt-4">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
              >
                Directions
              </a>
              {place.websiteUrl && (
                <a
                  href={place.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
                >
                  Website
                </a>
              )}
              {place.menuUrl && (
                <a
                  href={place.menuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
                >
                  Menu
                </a>
              )}
              {place.phone && (
                <a
                  href={`tel:${place.phone}`}
                  className="rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
                >
                  Call
                </a>
              )}
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
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#e0d6ca] px-5 py-3">
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-md bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-amber-light)] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setPlaceType(place.placeType || "");
                  setSelectedTagIds(place.tags.map((t) => t.id));
                  setNewTagName("");
                  setEditing(false);
                }}
                className="rounded-md border border-[#d4c9bb] px-4 py-2 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-parchment-dark)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setBeenThere(place.beenThere);
                  setPlaceType(place.placeType || "");
                  setNotes(place.personalNotes || "");
                  setSource(place.source || "");
                  setSelectedTagIds(place.tags.map((t) => t.id));
                  setNewTagName("");
                  setEditing(true);
                }}
                className="flex-1 rounded-md bg-[var(--color-cream)] px-3 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-parchment-dark)]"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  const res = await fetch("/api/places", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: place.id, archived: !place.archived }),
                  });
                  const updated = await res.json();
                  onUpdate({ ...place, ...updated });
                }}
                className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-parchment-dark)]"
              >
                {place.archived ? "Unarchive" : "Archive"}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-md px-3 py-2 text-sm font-medium text-[var(--color-terracotta)] transition-colors hover:bg-[var(--color-terracotta)]/10"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

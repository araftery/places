"use client";

import { Place, Tag, Cuisine, List, PlaceRating, PLACE_TYPES, RESERVATION_PROVIDERS } from "@/lib/types";
import { generateReviewLinks } from "@/lib/review-links";
import { formatRating, formatCount, getBestBlurb } from "@/lib/format-ratings";
import { useState, useRef, useEffect } from "react";

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  michelin: "Michelin",
  nyt: "NYT",
  infatuation: "Infatuation",
  beli: "Beli",
};

const RATING_SOURCE_ORDER = ["google", "michelin", "nyt", "infatuation", "beli"];

interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
  onUpdate: (place: Place) => void;
  onDelete: (id: number) => void;
  tags: Tag[];
  cuisines: Cuisine[];
  lists?: List[];
  onCreateTag: (name: string) => Promise<Tag>;
  onCuisineCreated: () => void;
  onTogglePlaceInList?: (placeId: number, listId: number) => Promise<void>;
  onCreateList?: (name: string) => Promise<List>;
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

function MichelinCloverIcon({ color = "#c41e24", size = 13 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 33 33"
      fill={color}
      className="inline-block"
    >
      <path d="M21.8,25.5c0,0.6,0.1,1.1,0.1,1.6c0,3.2-2.2,5.4-5.3,5.4c-3.2,0-5.3-2.2-5.3-5.7c0-0.5,0-0.5,0-0.7v-0.6 c-1.7,1.2-2.8,1.6-4.3,1.6c-2.7,0-5.2-2.6-5.2-5.5c0-2.1,1.5-3.9,3.7-4.9L6,16.5c-2.8-1.4-4.2-3-4.2-5.2c0-3,2.3-5.5,5.2-5.5 c1.2,0,2.7,0.6,3.8,1.4l0.5,0.2c0-0.6-0.1-1.1-0.1-1.5c0-3.2,2.2-5.4,5.3-5.4c3.2,0,5.3,2.2,5.3,5.7v0.7l-0.1,0.5 c1.7-1.2,2.8-1.6,4.3-1.6c2.7,0,5.2,2.6,5.2,5.5c0,2.1-1.5,3.9-3.7,4.9L27,16.5c2.8,1.4,4.2,3,4.2,5.2c0,3-2.3,5.5-5.2,5.5 c-1.2,0-2.8-0.5-3.8-1.4L21.8,25.5z M19.1,20.1c2.5,3.6,4.8,5.4,6.9,5.4c1.8,0,3.4-1.8,3.4-3.8c0-2.6-3.1-4.3-8.5-4.7v-0.9 c5.5-0.5,8.5-2.1,8.5-4.7c0-2-1.6-3.8-3.4-3.8c-2.1,0-4.4,1.8-6.9,5.4l-0.9-0.5c1.2-2.5,1.8-4.6,1.8-6.3c0-2.5-1.4-3.9-3.6-3.9 s-3.6,1.5-3.6,3.9c0,1.8,0.6,3.8,1.8,6.4l-0.9,0.5C11.5,9.6,9.1,7.8,7,7.8c-1.8,0-3.4,1.8-3.4,3.8c0,2.6,3,4.3,8.5,4.7v0.9 c-5.4,0.5-8.5,2.1-8.5,4.7c0,2,1.6,3.8,3.4,3.8c2.1,0,4.4-1.8,6.9-5.4l0.9,0.5c-1.2,2.6-1.8,4.7-1.8,6.4c0,2.3,1.4,3.9,3.6,3.9 s3.6-1.5,3.6-3.9c0-1.7-0.6-3.8-1.8-6.4L19.1,20.1z" />
    </svg>
  );
}

function MichelinBibIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 33 33"
      fill="#c41e24"
      className="inline-block"
    >
      <path d="M12.1,10.9c1.6,0,2.9,2,2.8,4.6c-0.1,2.3-1.1,3.3-1.1,3.3c0.8-3.3-0.4-4.2-1.6-4.2s-2.5,0.9-1.9,4.1c0,0-1.1-1.1-1.1-3.2 C9,12.9,10.4,10.9,12.1,10.9 M12.1,20.5c1.6,0,3.5-1.9,3.7-5.4c0.1-2.9-1.4-5.3-3.7-5.3c-2.4,0-3.9,2.7-3.9,5.6 C8.1,18.3,10.2,20.5,12.1,20.5 M29.8,16.7c0.6-3.8-0.9-10.1-8.1-12.2c-2.2-3.4-8.4-3.2-10.3,0C5,6.3,2.3,12.9,3,16.9 c-4.7,5.4-0.4,11.6-0.4,11.6s2.5,3.3,4.2,2.9c0,0,0.9-2.3-1.1-3.3c0,0-7-6.2,0.4-11.1C5.5,16.9,4.5,6.8,14.5,6.4 c0,0-1.5-0.6-1.1-1.1c1.3-1.3,5.3-1.4,6.3,0.3c0.4,0.8-1.5,0.9-1.5,0.9c10.8,0.3,9.4,10.5,9,10.8c6.2,4.8,0.5,10.5,0.3,11.1 c-1.9,1.1-0.6,3.2-0.6,3.2c0.5,0.5,3-2,3.7-2.9C30.4,28.6,35.1,21.9,29.8,16.7 M21.2,10.9c1.8,0,3,2,3,4.6c0,2.3-1.1,3.3-1.1,3.3 c0.6-3.3-0.5-4.2-1.8-4.2c-1.1,0-2.2,0.9-1.6,4.1c0,0-1.4-1.1-1.4-3.2C18.1,12.9,19.8,10.9,21.2,10.9 M21.2,20.5 c2,0,3.7-1.9,3.7-5.4c0-2.9-1.3-5.3-3.7-5.3c-2.2,0-4.1,2.7-3.9,5.6C17.3,18.3,19.5,20.5,21.2,20.5" />
      <path d="M19.3,28.1c-0.1,0-0.4,0.1-0.5,0.1L19.3,28.1z M25,24c-0.5-0.5-1,0.1-1,0.1c-0.4,0.6-0.6,1.3-1,1.8c0.3-5.1-1.9-4.2-1.9-4.2s-2,0.1-3.2,3.4 c-0.9,2.2-1,2.9-1,3.2c-0.1,0-0.3,0-0.4,0c-4.3,0.1-6.3-2.5-6.7-2.9c-0.4-0.5-0.9,0-0.9,0c-0.4,0.4-0.1,0.9-0.1,0.9 c0.6,0.9,2.7,3.4,8.2,3.4s7.6-3.7,7.8-4.1C25.1,25.2,25.5,24.4,25,24" />
    </svg>
  );
}

function MichelinRatingDisplay({ rating }: { rating: PlaceRating }) {
  const notes = rating.notes || "";
  const hasGreenStar = notes.includes("Green Star");

  // Starred
  if (rating.rating != null && rating.rating > 0) {
    return (
      <span className="flex items-center gap-0.5">
        {Array.from({ length: rating.rating }).map((_, i) => (
          <MichelinCloverIcon key={i} />
        ))}
        {hasGreenStar && <MichelinCloverIcon color="#1a7a3a" />}
      </span>
    );
  }

  // Bib Gourmand
  if (notes.includes("Bib Gourmand")) {
    return (
      <span className="flex items-center gap-1">
        <MichelinBibIcon />
        {hasGreenStar && <MichelinCloverIcon color="#1a7a3a" />}
      </span>
    );
  }

  // Selected
  return (
    <span className="flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)]">
      Selected
      {hasGreenStar && <MichelinCloverIcon color="#1a7a3a" />}
    </span>
  );
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
            if (source === "michelin") {
              ratingDisplay = <MichelinRatingDisplay rating={r} />;
            } else if (r.rating != null && r.ratingMax != null) {
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
  cuisines,
  lists,
  onCreateTag,
  onCuisineCreated,
  onTogglePlaceInList,
  onCreateList,
}: PlaceDetailProps) {
  const [editing, setEditing] = useState(false);
  const [showListPopover, setShowListPopover] = useState(false);
  const [newListName, setNewListName] = useState("");
  const listPopoverRef = useRef<HTMLDivElement>(null);
  const [beenThere, setBeenThere] = useState(place.beenThere);
  const [placeType, setPlaceType] = useState(place.placeType || "");
  const [notes, setNotes] = useState(place.personalNotes || "");
  const [source, setSource] = useState(place.source || "");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    place.tags.map((t) => t.id)
  );
  const [newTagName, setNewTagName] = useState("");
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<number[]>(
    place.cuisines?.map((c) => c.id) || []
  );
  const [newCuisineName, setNewCuisineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  // Reservation fields
  const [resProvider, setResProvider] = useState(place.reservationProvider || "");
  const [resUrl, setResUrl] = useState(place.reservationUrl || "");
  const [resWindowDays, setResWindowDays] = useState(place.openingWindowDays?.toString() || "");
  const [resOpeningTime, setResOpeningTime] = useState(place.openingTime || "");
  const [resPattern, setResPattern] = useState(place.openingPattern || "");
  const [resBulkDesc, setResBulkDesc] = useState(place.openingBulkDescription || "");
  const [resLastDate, setResLastDate] = useState(place.lastAvailableDate || "");
  const [resNotes, setResNotes] = useState(place.reservationNotes || "");

  // Detect reservation
  const [detectingReservation, setDetectingReservation] = useState(false);
  const [detectReservationStatus, setDetectReservationStatus] = useState<"idle" | "triggered" | "error">("idle");

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

  // Compact info line: Type · Cuisine · $$$ · Neighborhood
  const infoLineParts: string[] = [];
  if (place.placeType) {
    const typeLabel =
      PLACE_TYPES.find((t) => t.value === place.placeType)?.label ||
      place.placeType;
    infoLineParts.push(typeLabel);
  }
  if (place.cuisines?.length) {
    infoLineParts.push(place.cuisines.map((c) => c.name).join(", "));
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

  // Close list popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (listPopoverRef.current && !listPopoverRef.current.contains(e.target as Node)) {
        setShowListPopover(false);
      }
    }
    if (showListPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showListPopover]);

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

  async function handleAddCuisine() {
    if (!newCuisineName.trim()) return;
    const res = await fetch("/api/cuisines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCuisineName.trim() }),
    });
    if (res.ok) {
      const cuisine = await res.json();
      setSelectedCuisineIds((prev) => [...prev, cuisine.id]);
      setNewCuisineName("");
      onCuisineCreated();
    }
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
          cuisineIds: selectedCuisineIds,
          reservationProvider: resProvider || null,
          reservationUrl: resUrl || null,
          openingWindowDays: resWindowDays ? parseInt(resWindowDays) : null,
          openingTime: resOpeningTime || null,
          openingPattern: resPattern || null,
          openingBulkDescription: resBulkDesc || null,
          lastAvailableDate: resLastDate || null,
          reservationNotes: resNotes || null,
        }),
      });
      const updated = await res.json();
      const updatedTags = tags.filter((t) => selectedTagIds.includes(t.id));
      const updatedCuisines = cuisines.filter((c) => selectedCuisineIds.includes(c.id));
      onUpdate({ ...place, ...updated, tags: updatedTags, cuisines: updatedCuisines });
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
                Cuisines
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {cuisines.map((cuisine) => (
                  <button
                    key={cuisine.id}
                    type="button"
                    onClick={() =>
                      setSelectedCuisineIds((prev) =>
                        prev.includes(cuisine.id)
                          ? prev.filter((id) => id !== cuisine.id)
                          : [...prev, cuisine.id]
                      )
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      selectedCuisineIds.includes(cuisine.id)
                        ? "bg-[var(--color-amber)] text-white"
                        : "border border-[#d4c9bb] bg-[var(--color-cream)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {cuisine.name}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newCuisineName}
                  onChange={(e) => setNewCuisineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCuisine();
                    }
                  }}
                  className="flex-1 rounded-md border border-[#d4c9bb] bg-white px-3 py-1.5 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                  placeholder="New cuisine..."
                />
                <button
                  onClick={handleAddCuisine}
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

            {/* Reservation fields */}
            <div className="border-t border-[#e0d6ca] pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Reservations
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                    Provider
                  </label>
                  <select
                    value={resProvider}
                    onChange={(e) => setResProvider(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-amber)] focus:outline-none"
                  >
                    <option value="">None</option>
                    {RESERVATION_PROVIDERS.map((rp) => (
                      <option key={rp.value} value={rp.value}>
                        {rp.label}
                      </option>
                    ))}
                  </select>
                </div>
                {resProvider && !["walk_in", "phone", "none"].includes(resProvider) && (
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                      Booking URL
                    </label>
                    <input
                      value={resUrl}
                      onChange={(e) => setResUrl(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                      placeholder="https://resy.com/..."
                    />
                  </div>
                )}
                {resProvider && resProvider !== "none" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                          Window (days)
                        </label>
                        <input
                          type="number"
                          value={resWindowDays}
                          onChange={(e) => setResWindowDays(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                          placeholder="e.g. 28"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                          Opening Time
                        </label>
                        <input
                          value={resOpeningTime}
                          onChange={(e) => setResOpeningTime(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                          placeholder="e.g. 10:00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                        Opening Pattern
                      </label>
                      <div className="mt-1.5 flex gap-3">
                        <label className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
                          <input
                            type="radio"
                            name="openingPattern"
                            value="rolling"
                            checked={resPattern === "rolling"}
                            onChange={(e) => setResPattern(e.target.value)}
                            className="accent-[var(--color-amber)]"
                          />
                          Rolling
                        </label>
                        <label className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
                          <input
                            type="radio"
                            name="openingPattern"
                            value="bulk"
                            checked={resPattern === "bulk"}
                            onChange={(e) => setResPattern(e.target.value)}
                            className="accent-[var(--color-amber)]"
                          />
                          Bulk
                        </label>
                        {resPattern && (
                          <button
                            type="button"
                            onClick={() => setResPattern("")}
                            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    {resPattern === "bulk" && (
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                          Bulk Description
                        </label>
                        <input
                          value={resBulkDesc}
                          onChange={(e) => setResBulkDesc(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                          placeholder="e.g. 1st of month opens entire next month"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                        Last Available Date
                      </label>
                      <input
                        type="date"
                        value={resLastDate}
                        onChange={(e) => setResLastDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-amber)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                        Reservation Notes
                      </label>
                      <input
                        value={resNotes}
                        onChange={(e) => setResNotes(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                        placeholder="e.g. Counter seating walk-in only"
                      />
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  setDetectingReservation(true);
                  try {
                    const res = await fetch("/api/places/detect-reservation", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ placeId: place.id }),
                    });
                    if (res.ok) {
                      setDetectReservationStatus("triggered");
                    } else {
                      setDetectReservationStatus("error");
                    }
                  } catch {
                    setDetectReservationStatus("error");
                  } finally {
                    setDetectingReservation(false);
                  }
                }}
                disabled={detectingReservation}
                className="mt-3 w-full rounded-md border border-[#d4c9bb] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)] disabled:opacity-50"
              >
                {detectingReservation
                  ? "Triggering..."
                  : detectReservationStatus === "triggered"
                    ? "Detection triggered ✓"
                    : detectReservationStatus === "error"
                      ? "Failed — try again"
                      : "Detect reservations"}
              </button>
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
                  editing && <button
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

            {/* Reservations */}
            {place.reservationProvider && place.reservationProvider !== "" && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Reservations
                </p>
                <div className="mt-1.5 rounded-lg bg-[var(--color-cream)] px-3.5 py-2.5 space-y-1">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {RESERVATION_PROVIDERS.find((rp) => rp.value === place.reservationProvider)?.label || place.reservationProvider}
                  </p>
                  {place.openingWindowDays && place.openingPattern && (
                    <p className="text-xs text-[var(--color-ink-light)]">
                      {place.openingWindowDays}-day {place.openingPattern} window
                    </p>
                  )}
                  {place.openingWindowDays && !place.openingPattern && (
                    <p className="text-xs text-[var(--color-ink-light)]">
                      {place.openingWindowDays}-day booking window
                    </p>
                  )}
                  {place.openingPattern === "bulk" && place.openingBulkDescription && (
                    <p className="text-xs text-[var(--color-ink-light)]">
                      {place.openingBulkDescription}
                    </p>
                  )}
                  {place.openingTime && (
                    <p className="text-xs text-[var(--color-ink-light)]">
                      Opens daily at {place.openingTime?.slice(0, 5)}
                    </p>
                  )}
                  {place.lastAvailableDate && (
                    <p className="text-xs text-[var(--color-ink-light)]">
                      Bookable through{" "}
                      {new Date(place.lastAvailableDate + "T12:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                  {place.openingPattern === "rolling" && place.lastAvailableDate && place.openingTime && (
                    <p className="text-xs font-medium text-[var(--color-amber)]">
                      Next opening:{" "}
                      {(() => {
                        const next = new Date(place.lastAvailableDate + "T12:00:00");
                        next.setDate(next.getDate() + 1);
                        return next.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      })()}{" "}
                      at {place.openingTime?.slice(0, 5)}
                    </p>
                  )}
                  {place.reservationUrl && (
                    <a
                      href={place.reservationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-[#e0d6ca] bg-[var(--color-parchment)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-amber)] transition-colors hover:border-[var(--color-amber)]"
                    >
                      Book on{" "}
                      {RESERVATION_PROVIDERS.find((rp) => rp.value === place.reservationProvider)?.label || "Provider"}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17L17 7" />
                        <path d="M7 7h10v10" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Tags & Cuisines */}
            {(place.tags.length > 0 || (place.cuisines?.length ?? 0) > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {place.tags.map((tag) => (
                  <span
                    key={`tag-${tag.id}`}
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-white/90"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
                {place.cuisines?.map((cuisine) => (
                  <span
                    key={`cuisine-${cuisine.id}`}
                    className="rounded-md border border-[var(--color-amber)]/30 bg-[var(--color-amber)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-amber)]"
                  >
                    {cuisine.name}
                  </span>
                ))}
              </div>
            )}

            {/* Lists */}
            {lists && onTogglePlaceInList && !editing && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Lists
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {lists
                    .filter((l) => place.listIds?.includes(l.id))
                    .map((l) => (
                      <span
                        key={l.id}
                        className="rounded-md border border-[var(--color-amber)]/30 bg-[var(--color-amber)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-amber)]"
                      >
                        {l.name}
                      </span>
                    ))}
                  <div className="relative" ref={listPopoverRef}>
                    <button
                      onClick={() => setShowListPopover(!showListPopover)}
                      className="rounded-md border border-dashed border-[#d4c9bb] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
                    >
                      + Add to list
                    </button>
                    {showListPopover && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-[#e0d6ca] bg-[var(--color-parchment)] p-2 shadow-lg">
                        {lists.map((l) => {
                          const isInList = place.listIds?.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              onClick={() => onTogglePlaceInList(place.id, l.id)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-cream)]"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  isInList
                                    ? "border-[var(--color-amber)] bg-[var(--color-amber)] text-white"
                                    : "border-[#d4c9bb]"
                                }`}
                              >
                                {isInList && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </span>
                              <span className="text-[var(--color-ink)]">{l.name}</span>
                            </button>
                          );
                        })}
                        {lists.length === 0 && (
                          <p className="px-2 py-1 text-xs text-[var(--color-ink-muted)]">No lists yet</p>
                        )}
                        <div className="mt-1 border-t border-[#e0d6ca] pt-1">
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!newListName.trim() || !onCreateList) return;
                              const created = await onCreateList(newListName.trim());
                              setNewListName("");
                              await onTogglePlaceInList(place.id, created.id);
                            }}
                            className="flex gap-1"
                          >
                            <input
                              value={newListName}
                              onChange={(e) => setNewListName(e.target.value)}
                              placeholder="New list..."
                              className="flex-1 rounded-md border border-[#d4c9bb] bg-white px-2 py-1 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-amber)] focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!newListName.trim()}
                              className="rounded-md bg-[var(--color-amber)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              Add
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                  setSelectedCuisineIds(place.cuisines?.map((c) => c.id) || []);
                  setNewCuisineName("");
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
                  setSelectedCuisineIds(place.cuisines?.map((c) => c.id) || []);
                  setNewCuisineName("");
                  setResProvider(place.reservationProvider || "");
                  setResUrl(place.reservationUrl || "");
                  setResWindowDays(place.openingWindowDays?.toString() || "");
                  setResOpeningTime(place.openingTime || "");
                  setResPattern(place.openingPattern || "");
                  setResBulkDesc(place.openingBulkDescription || "");
                  setResLastDate(place.lastAvailableDate || "");
                  setResNotes(place.reservationNotes || "");
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

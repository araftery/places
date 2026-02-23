"use client";

import { Place } from "@/lib/types";
import type { TravelTimeBand } from "@/app/page";

const STATUS_LABELS: Record<string, string> = {
  want_to_try: "Want to Try",
  been_there: "Been There",
  archived: "Archived",
};

const STATUS_STYLES: Record<string, string> = {
  want_to_try: "bg-[var(--color-slate-blue)]/20 text-[#8aafc9]",
  been_there: "bg-[var(--color-sage)]/20 text-[var(--color-sage-light)]",
  archived: "bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)]",
};

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

interface PlaceCardProps {
  place: Place;
  isSelected: boolean;
  onClick: () => void;
  travelTime?: TravelTimeBand | null;
}

export default function PlaceCard({
  place,
  isSelected,
  onClick,
  travelTime,
}: PlaceCardProps) {
  const googleRating = place.ratings?.find((r) => r.source === "google");

  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-lg border p-3 text-left transition-all ${
        isSelected
          ? "border-[var(--color-amber)]/50 bg-[var(--color-amber-dim)]"
          : "border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:border-[var(--color-sidebar-muted)]/50 hover:bg-[var(--color-sidebar-surface)]/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`text-sm font-semibold leading-tight ${
            isSelected
              ? "text-[var(--color-amber-light)]"
              : "text-[var(--color-sidebar-text)]"
          }`}
        >
          {place.name}
        </h3>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            STATUS_STYLES[place.status] || ""
          }`}
        >
          {STATUS_LABELS[place.status] || place.status}
        </span>
      </div>

      {place.neighborhood && (
        <p className="mt-0.5 text-xs text-[var(--color-sidebar-muted)]">
          {place.neighborhood}
          {place.city ? `, ${place.city}` : ""}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {place.placeType && (
          <span className="text-[11px] capitalize text-[var(--color-sidebar-muted)]">
            {place.placeType.replace("_", " ")}
          </span>
        )}
        {place.priceRange && (
          <span className="text-[11px] text-[var(--color-sidebar-muted)]">
            {PRICE_LABELS[place.priceRange]}
          </span>
        )}
        {googleRating?.rating && (
          <span className="text-[11px] text-[var(--color-amber)]">
            ★ {googleRating.rating}
          </span>
        )}
        {place.cuisineType && place.cuisineType.length > 0 && (
          <span className="text-[11px] text-[var(--color-sidebar-muted)]/70">
            {place.cuisineType.join(", ")}
          </span>
        )}
        {travelTime && (
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/90"
            style={{ backgroundColor: travelTime.color }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            &lt; {travelTime.minutes} min
          </span>
        )}
      </div>

      {place.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {place.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/90"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

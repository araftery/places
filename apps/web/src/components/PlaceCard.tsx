"use client";

import { Place } from "@/lib/types";
import type { TravelTimeBand } from "@/lib/geo";

const PRICE_LABELS = ["", "$", "$$", "$$$", "$$$$"];

const PROVIDER_SHORT: Record<string, string> = {
  resy: "Resy",
  opentable: "OT",
  sevenrooms: "7R",
  thefork: "TF",
  walk_in: "Walk-in",
  phone: "Phone",
  other: "Res",
};

interface PlaceCardProps {
  place: Place;
  isSelected: boolean;
  onClick: () => void;
  travelTime?: TravelTimeBand | null;
  compact?: boolean;
}

export default function PlaceCard({
  place,
  isSelected,
  onClick,
  travelTime,
  compact,
}: PlaceCardProps) {
  const googleRating = place.ratings?.find((r) => r.source === "google");

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`group w-full rounded-lg border px-3 py-2 text-left transition-all ${
          isSelected
            ? "border-[var(--color-amber)]/50 bg-[var(--color-amber-dim)]"
            : "border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] hover:border-[var(--color-sidebar-muted)]/50 hover:bg-[var(--color-sidebar-surface)]/80"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`truncate text-sm font-semibold leading-tight ${
              isSelected
                ? "text-[var(--color-amber-light)]"
                : "text-[var(--color-sidebar-text)]"
            }`}
          >
            {place.name}
          </h3>
          {place.beenThere && (
            <svg
              className="shrink-0 text-[var(--color-sage-light)]"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-x-1.5 text-[11px] text-[var(--color-sidebar-muted)]">
          {place.placeType && (
            <span className="capitalize">{place.placeType.replace("_", " ")}</span>
          )}
          {place.placeType && (place.priceRange || googleRating?.rating || travelTime) && (
            <span className="text-[var(--color-sidebar-muted)]/40">&middot;</span>
          )}
          {place.priceRange && (
            <span>{PRICE_LABELS[place.priceRange]}</span>
          )}
          {place.priceRange && (googleRating?.rating || travelTime) && (
            <span className="text-[var(--color-sidebar-muted)]/40">&middot;</span>
          )}
          {googleRating?.rating && (
            <span className="text-[var(--color-amber)]">★ {googleRating.rating}</span>
          )}
          {googleRating?.rating && travelTime && (
            <span className="text-[var(--color-sidebar-muted)]/40">&middot;</span>
          )}
          {travelTime && (
            <span style={{ color: travelTime.color }}>
              &lt; {travelTime.minutes} min
            </span>
          )}
          {place.closedPermanently && (
            <>
              <span className="text-[var(--color-sidebar-muted)]/40">&middot;</span>
              <span className="font-semibold uppercase text-[var(--color-terracotta)]">Closed</span>
            </>
          )}
          {!place.closedPermanently && place.reservationProvider && PROVIDER_SHORT[place.reservationProvider] && (
            <>
              <span className="text-[var(--color-sidebar-muted)]/40">&middot;</span>
              <span className="text-[var(--color-sidebar-muted)]/70">{PROVIDER_SHORT[place.reservationProvider]}</span>
            </>
          )}
        </div>
      </button>
    );
  }

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
        <div className="min-w-0 flex-1">
          <h3
            className={`text-sm font-semibold leading-tight ${
              isSelected
                ? "text-[var(--color-amber-light)]"
                : "text-[var(--color-sidebar-text)]"
            }`}
          >
            {place.name}
          </h3>
          {place.closedPermanently && (
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-terracotta)]">
              Permanently Closed
            </p>
          )}
        </div>
        {place.beenThere && (
          <svg
            className="shrink-0 text-[var(--color-sage-light)]"
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
        )}
      </div>

      {place.neighborhood && (
        <p className="mt-0.5 text-xs text-[var(--color-sidebar-muted)]">
          {place.neighborhood}
          {place.cityName ? `, ${place.cityName}` : ""}
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
        {place.reservationProvider && PROVIDER_SHORT[place.reservationProvider] && (
          <span className="text-[11px] text-[var(--color-sidebar-muted)]/70">
            {PROVIDER_SHORT[place.reservationProvider]}
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

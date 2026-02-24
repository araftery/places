"use client";

import type { GuideRestaurant } from "@places/clients/infatuation";
import type { TravelTimeBand } from "@/lib/geo";

type AddStatus = "idle" | "adding" | "added" | "duplicate" | "no-match";

interface DiscoverRestaurantCardProps {
  restaurant: GuideRestaurant;
  guideTitle: string;
  cityId: number;
  status: AddStatus;
  error: string | null;
  alreadyInList: boolean;
  onAdd: () => void;
  isSelected?: boolean;
  onClick?: () => void;
  showDate?: boolean;
  travelTime?: TravelTimeBand | null;
}

export default function DiscoverRestaurantCard({
  restaurant,
  status,
  error,
  alreadyInList,
  onAdd,
  isSelected,
  onClick,
  showDate,
  travelTime,
}: DiscoverRestaurantCardProps) {
  const { venue } = restaurant;

  const effectiveStatus: AddStatus =
    alreadyInList && status === "idle" ? "duplicate" : status;

  const isSaved = effectiveStatus === "duplicate" || effectiveStatus === "added";

  return (
    <div
      className={`rounded-lg p-3 transition-colors ${
        isSelected
          ? `bg-[var(--color-sidebar-surface)] ring-1 ${isSaved ? "ring-[var(--color-slate-blue)]" : "ring-[var(--color-amber)]"}`
          : "bg-[var(--color-sidebar-surface)]"
      } ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4
            className="truncate text-sm font-semibold text-[var(--color-sidebar-text)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            {venue.name || restaurant.title}
          </h4>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
            {restaurant.neighborhood && (
              <span>{restaurant.neighborhood}</span>
            )}
            {restaurant.rating != null && (
              <span className="font-semibold text-[var(--color-amber)]">
                {restaurant.rating}/10
              </span>
            )}
            {venue.price != null && (
              <span>{"$".repeat(venue.price)}</span>
            )}
            {travelTime && (
              <span className="font-semibold" style={{ color: travelTime.color }}>
                &lt; {travelTime.minutes} min
              </span>
            )}
            {showDate && restaurant.addedDate && (
              <span>
                {new Date(restaurant.addedDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Add button */}
        <div className="shrink-0">
          {effectiveStatus === "idle" && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="rounded-md bg-[var(--color-amber)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-amber-light)]"
            >
              + Add
            </button>
          )}
          {effectiveStatus === "adding" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--color-sidebar-muted)]">
              <div className="h-3 w-3 rounded-full border-2 border-[var(--color-amber)] border-t-transparent animate-spin" />
            </div>
          )}
          {effectiveStatus === "added" && (
            <span className="rounded-md bg-[var(--color-slate-blue)] px-2.5 py-1 text-xs font-semibold text-white">
              Added
            </span>
          )}
          {effectiveStatus === "duplicate" && (
            <span className="rounded-md bg-[var(--color-slate-blue)] px-2.5 py-1 text-[11px] font-semibold text-white">
              In list
            </span>
          )}
          {effectiveStatus === "no-match" && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="rounded-md bg-[var(--color-terracotta)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-80"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {(restaurant.blurb || restaurant.preview) && (
        <p className={`mt-1.5 text-[11px] leading-relaxed text-[var(--color-sidebar-muted)] ${isSelected ? "" : "line-clamp-2"}`}>
          {isSelected ? (restaurant.blurb || restaurant.preview) : (restaurant.preview || restaurant.blurb)}
        </p>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-[var(--color-terracotta)]">{error}</p>
      )}
    </div>
  );
}

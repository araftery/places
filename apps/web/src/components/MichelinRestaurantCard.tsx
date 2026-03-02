"use client";

import type { MichelinRestaurant } from "@places/clients/michelin";
import type { TravelTimeBand } from "@/lib/geo";

type AddStatus = "idle" | "adding" | "added" | "duplicate" | "no-match";

interface MichelinRestaurantCardProps {
  restaurant: MichelinRestaurant;
  status: AddStatus;
  error: string | null;
  alreadyInList: boolean;
  onAdd: () => void;
  isSelected?: boolean;
  onClick?: () => void;
  travelTime?: TravelTimeBand | null;
}

function MichelinClover({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 33 33"
      fill="currentColor"
      className={className}
    >
      <path d="M21.8,25.5c0,0.6,0.1,1.1,0.1,1.6c0,3.2-2.2,5.4-5.3,5.4c-3.2,0-5.3-2.2-5.3-5.7c0-0.5,0-0.5,0-0.7v-0.6 c-1.7,1.2-2.8,1.6-4.3,1.6c-2.7,0-5.2-2.6-5.2-5.5c0-2.1,1.5-3.9,3.7-4.9L6,16.5c-2.8-1.4-4.2-3-4.2-5.2c0-3,2.3-5.5,5.2-5.5 c1.2,0,2.7,0.6,3.8,1.4l0.5,0.2c0-0.6-0.1-1.1-0.1-1.5c0-3.2,2.2-5.4,5.3-5.4c3.2,0,5.3,2.2,5.3,5.7v0.7l-0.1,0.5 c1.7-1.2,2.8-1.6,4.3-1.6c2.7,0,5.2,2.6,5.2,5.5c0,2.1-1.5,3.9-3.7,4.9L27,16.5c2.8,1.4,4.2,3,4.2,5.2c0,3-2.3,5.5-5.2,5.5 c-1.2,0-2.8-0.5-3.8-1.4L21.8,25.5z M19.1,20.1c2.5,3.6,4.8,5.4,6.9,5.4c1.8,0,3.4-1.8,3.4-3.8c0-2.6-3.1-4.3-8.5-4.7v-0.9 c5.5-0.5,8.5-2.1,8.5-4.7c0-2-1.6-3.8-3.4-3.8c-2.1,0-4.4,1.8-6.9,5.4l-0.9-0.5c1.2-2.5,1.8-4.6,1.8-6.3c0-2.5-1.4-3.9-3.6-3.9 s-3.6,1.5-3.6,3.9c0,1.8,0.6,3.8,1.8,6.4l-0.9,0.5C11.5,9.6,9.1,7.8,7,7.8c-1.8,0-3.4,1.8-3.4,3.8c0,2.6,3,4.3,8.5,4.7v0.9 c-5.4,0.5-8.5,2.1-8.5,4.7c0,2,1.6,3.8,3.4,3.8c2.1,0,4.4-1.8,6.9-5.4l0.9,0.5c-1.2,2.6-1.8,4.7-1.8,6.4c0,2.3,1.4,3.9,3.6,3.9 s3.6-1.5,3.6-3.9c0-1.7-0.6-3.8-1.8-6.4L19.1,20.1z" />
    </svg>
  );
}

function DistinctionBadge({ restaurant }: { restaurant: MichelinRestaurant }) {
  if (restaurant.stars > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[#c41e24]">
        {Array.from({ length: restaurant.stars }).map((_, i) => (
          <MichelinClover key={i} />
        ))}
        {restaurant.greenStar && (
          <MichelinClover className="text-[#1a7a3a]" />
        )}
      </span>
    );
  }

  if (restaurant.distinction === "BIB_GOURMAND" || restaurant.distinction === "bib_gourmand") {
    return (
      <span className="flex items-center text-[#c41e24]">
        <svg width="16" height="16" viewBox="0 0 33 33" fill="currentColor">
          <path d="M12.1,10.9c1.6,0,2.9,2,2.8,4.6c-0.1,2.3-1.1,3.3-1.1,3.3c0.8-3.3-0.4-4.2-1.6-4.2s-2.5,0.9-1.9,4.1c0,0-1.1-1.1-1.1-3.2 C9,12.9,10.4,10.9,12.1,10.9 M12.1,20.5c1.6,0,3.5-1.9,3.7-5.4c0.1-2.9-1.4-5.3-3.7-5.3c-2.4,0-3.9,2.7-3.9,5.6 C8.1,18.3,10.2,20.5,12.1,20.5 M29.8,16.7c0.6-3.8-0.9-10.1-8.1-12.2c-2.2-3.4-8.4-3.2-10.3,0C5,6.3,2.3,12.9,3,16.9 c-4.7,5.4-0.4,11.6-0.4,11.6s2.5,3.3,4.2,2.9c0,0,0.9-2.3-1.1-3.3c0,0-7-6.2,0.4-11.1C5.5,16.9,4.5,6.8,14.5,6.4 c0,0-1.5-0.6-1.1-1.1c1.3-1.3,5.3-1.4,6.3,0.3c0.4,0.8-1.5,0.9-1.5,0.9c10.8,0.3,9.4,10.5,9,10.8c6.2,4.8,0.5,10.5,0.3,11.1 c-1.9,1.1-0.6,3.2-0.6,3.2c0.5,0.5,3-2,3.7-2.9C30.4,28.6,35.1,21.9,29.8,16.7 M21.2,10.9c1.8,0,3,2,3,4.6c0,2.3-1.1,3.3-1.1,3.3 c0.6-3.3-0.5-4.2-1.8-4.2c-1.1,0-2.2,0.9-1.6,4.1c0,0-1.4-1.1-1.4-3.2C18.1,12.9,19.8,10.9,21.2,10.9 M21.2,20.5 c2,0,3.7-1.9,3.7-5.4c0-2.9-1.3-5.3-3.7-5.3c-2.2,0-4.1,2.7-3.9,5.6C17.3,18.3,19.5,20.5,21.2,20.5" />
          <path d="M19.3,28.1c-0.1,0-0.4,0.1-0.5,0.1L19.3,28.1z M25,24c-0.5-0.5-1,0.1-1,0.1c-0.4,0.6-0.6,1.3-1,1.8c0.3-5.1-1.9-4.2-1.9-4.2s-2,0.1-3.2,3.4 c-0.9,2.2-1,2.9-1,3.2c-0.1,0-0.3,0-0.4,0c-4.3,0.1-6.3-2.5-6.7-2.9c-0.4-0.5-0.9,0-0.9,0c-0.4,0.4-0.1,0.9-0.1,0.9 c0.6,0.9,2.7,3.4,8.2,3.4s7.6-3.7,7.8-4.1C25.1,25.2,25.5,24.4,25,24" />
        </svg>
      </span>
    );
  }

  return (
    <span className="text-[10px] font-medium text-[var(--color-sidebar-muted)]">
      Selected
    </span>
  );
}

export default function MichelinRestaurantCard({
  restaurant,
  status,
  error,
  alreadyInList,
  onAdd,
  isSelected,
  onClick,
  travelTime,
}: MichelinRestaurantCardProps) {
  const effectiveStatus: AddStatus =
    alreadyInList && status === "idle" ? "duplicate" : status;
  const isSaved = effectiveStatus === "duplicate" || effectiveStatus === "added";

  return (
    <div
      className={`overflow-hidden rounded-lg transition-colors ${
        isSelected
          ? `bg-[var(--color-sidebar-surface)] ring-1 ${isSaved ? "ring-[var(--color-slate-blue)]" : "ring-[var(--color-amber)]"}`
          : "bg-[var(--color-sidebar-surface)]"
      } ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {/* Image */}
      {restaurant.imageUrl && (
        <div
          className={`w-full overflow-hidden transition-all duration-200 ${
            isSelected ? "aspect-[3/2]" : "h-20"
          }`}
        >
          <img
            src={restaurant.imageUrl}
            alt={restaurant.name}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4
                className="truncate text-sm font-semibold text-[var(--color-sidebar-text)]"
                style={{ fontFamily: "var(--font-libre-baskerville)" }}
              >
                {restaurant.name}
              </h4>
              <DistinctionBadge restaurant={restaurant} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
              {restaurant.cuisines.length > 0 && (
                <span>{restaurant.cuisines.slice(0, 2).join(", ")}</span>
              )}
              {restaurant.priceLabel && (
                <span>{restaurant.priceLabel}</span>
              )}
              {travelTime && (
                <span
                  className="font-semibold"
                  style={{ color: travelTime.color }}
                >
                  &lt; {travelTime.minutes} min
                  {travelTime.label ? ` ${travelTime.label}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* Add button */}
          <div className="shrink-0">
            {effectiveStatus === "idle" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                className="rounded-md bg-[var(--color-terracotta)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-80"
              >
                Retry
              </button>
            )}
          </div>
        </div>

        {restaurant.description && (
          <p
            className={`mt-1.5 text-[11px] leading-relaxed text-[var(--color-sidebar-muted)] ${
              isSelected ? "" : "line-clamp-2"
            }`}
          >
            {restaurant.description}
          </p>
        )}

        {restaurant.chef && isSelected && (
          <p className="mt-1 text-[11px] text-[var(--color-sidebar-muted)]">
            Chef: {restaurant.chef}
          </p>
        )}

        {error && (
          <p className="mt-1 text-[11px] text-[var(--color-terracotta)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

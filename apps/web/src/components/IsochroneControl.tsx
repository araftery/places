"use client";

import { useState } from "react";

export interface IsochroneSettings {
  active: boolean;
  lat: number | null;
  lng: number | null;
  mode: "walking" | "public_transport" | "driving";
}

export const TIME_STEPS: Record<string, number[]> = {
  walking: [10, 20, 30],
  public_transport: [15, 30, 45],
  driving: [15, 30, 45],
};

function getRingColors(steps: number[]): { minutes: number; color: string }[] {
  const palette = ["#b5543b", "#c47d2e", "#5a7a5e"];
  return steps.map((m, i) => ({ minutes: m, color: palette[i] }));
}

interface IsochroneControlProps {
  settings: IsochroneSettings;
  onChange: (settings: IsochroneSettings) => void;
  loading: boolean;
  onFetch: () => void;
  onClear: () => void;
  onUseLocation: () => void;
  hasIsochrone: boolean;
}

const MODES = [
  { value: "walking", label: "Walk", icon: "\u{1F6B6}" },
  { value: "public_transport", label: "Transit", icon: "\u{1F687}" },
  { value: "driving", label: "Drive", icon: "\u{1F697}" },
] as const;

export default function IsochroneControl({
  settings,
  onChange,
  loading,
  onFetch,
  onClear,
  onUseLocation,
  hasIsochrone,
}: IsochroneControlProps) {
  const [expanded, setExpanded] = useState(false);

  const steps = TIME_STEPS[settings.mode];
  const rings = getRingColors(steps);

  if (!expanded) {
    return (
      <button
        onClick={() => {
          setExpanded(true);
          onChange({ ...settings, active: true });
        }}
        className="flex items-center gap-2 rounded-lg border border-[#e0d6ca] bg-[var(--color-parchment)] px-3.5 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
        style={{ boxShadow: "var(--shadow-float)" }}
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
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
        Nearby
      </button>
    );
  }

  return (
    <div
      className="w-64 rounded-lg border border-[#e0d6ca] bg-[var(--color-parchment)] p-4"
      style={{ boxShadow: "var(--shadow-float)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-semibold text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-libre-baskerville)" }}
        >
          Nearby Search
        </h3>
        <button
          onClick={() => {
            setExpanded(false);
            onClear();
            onChange({
              active: false,
              lat: null,
              lng: null,
              mode: "walking",
            });
          }}
          className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Close
        </button>
      </div>

      <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">
        {settings.lat
          ? "Point set. Adjust settings and search."
          : "Click the map to set a starting point, or:"}
      </p>

      {!settings.lat && (
        <button
          onClick={onUseLocation}
          className="mt-2.5 w-full rounded-md border border-[#d4c9bb] bg-[var(--color-cream)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
        >
          Use my location
        </button>
      )}

      {settings.lat && (
        <>
          {/* Mode */}
          <div className="mt-3 flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onChange({ ...settings, mode: m.value })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                  settings.mode === m.value
                    ? "bg-[var(--color-amber)] text-white"
                    : "border border-[#d4c9bb] bg-[var(--color-cream)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {/* Color legend */}
          {hasIsochrone && (
            <div className="mt-2.5 flex items-center justify-between rounded-md border border-[#e0d6ca] bg-[var(--color-cream)] px-2.5 py-2">
              {rings.map((ring) => (
                <div key={ring.minutes} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: ring.color, opacity: 0.7 }}
                  />
                  <span className="text-[10px] font-medium text-[var(--color-ink-muted)]">
                    {ring.minutes} min
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onFetch}
            disabled={loading}
            className="mt-3 w-full rounded-md bg-[var(--color-amber)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-amber-light)] disabled:opacity-50"
          >
            {loading ? "Searching..." : "Show reachable area"}
          </button>

          <button
            onClick={onClear}
            className="mt-1.5 w-full text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}

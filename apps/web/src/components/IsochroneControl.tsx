"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface IsochroneSettings {
  active: boolean;
  lat: number | null;
  lng: number | null;
  mode: "walking" | "public_transport" | "driving" | "mixed";
}

export const TIME_STEPS: Record<string, number[]> = {
  walking: [10, 20, 30],
  public_transport: [15, 30, 45],
  driving: [15, 30, 45],
  mixed: [10],
};

interface RingLegendItem {
  label: string;
  color: string;
}

function getRingColors(mode: string, steps: number[]): RingLegendItem[] {
  if (mode === "mixed") {
    return [
      { label: "10 min walk", color: "#5a7a5e" },
      { label: "10 min transit", color: "#c47d2e" },
      { label: "20 min transit", color: "#b5543b" },
    ];
  }
  const palette = ["#b5543b", "#c47d2e", "#5a7a5e"];
  return steps.map((m, i) => ({ label: `${m} min`, color: palette[i] }));
}

interface Suggestion {
  placePrediction: {
    placeId: string;
    text: { text: string };
    structuredFormat: {
      mainText: { text: string };
      secondaryText: { text: string };
    };
  };
}

interface IsochroneControlProps {
  settings: IsochroneSettings;
  onChange: (settings: IsochroneSettings) => void;
  loading: boolean;
  onFetch: () => void;
  onClear: () => void;
  onUseLocation: () => void;
  hasIsochrone: boolean;
  mapCenter?: { lat: number; lng: number };
}

const MODES = [
  { value: "walking", label: "Walk", icon: "\u{1F6B6}" },
  { value: "public_transport", label: "Transit", icon: "\u{1F687}" },
  { value: "driving", label: "Drive", icon: "\u{1F697}" },
  { value: "mixed", label: "Mixed", icon: "\u{1F310}" },
] as const;

export default function IsochroneControl({
  settings,
  onChange,
  loading,
  onFetch,
  onClear,
  onUseLocation,
  hasIsochrone,
  mapCenter,
}: IsochroneControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      let url = `/api/search?input=${encodeURIComponent(query)}&allTypes=1`;
      if (mapCenter) {
        url += `&lat=${mapCenter.lat}&lng=${mapCenter.lng}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    }
  }, [mapCenter]);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  async function selectSuggestion(suggestion: Suggestion) {
    setSearchLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placePrediction.placeId }),
      });
      const data = await res.json();
      if (data.lat && data.lng) {
        onChange({ ...settings, lat: data.lat, lng: data.lng });
      }
    } finally {
      setSearchLoading(false);
      setShowSearch(false);
      setSearchQuery("");
      setSuggestions([]);
    }
  }

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const steps = TIME_STEPS[settings.mode];
  const rings = getRingColors(settings.mode, steps);

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
            setShowSearch(false);
            setSearchQuery("");
            setSuggestions([]);
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
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button
            onClick={onUseLocation}
            className="w-full rounded-md border border-[#d4c9bb] bg-[var(--color-cream)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
          >
            Use my location
          </button>

          {!showSearch ? (
            <button
              onClick={() => setShowSearch(true)}
              className="w-full rounded-md border border-[#d4c9bb] bg-[var(--color-cream)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]"
            >
              Search for a place
            </button>
          ) : (
            <div ref={searchRef} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="e.g. AMC Lincoln Square"
                autoFocus
                className="w-full rounded-md border border-[#d4c9bb] bg-[var(--color-cream)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/50 focus:border-[var(--color-amber)] focus:outline-none"
              />
              {searchLoading && (
                <div className="mt-1.5 text-center text-[10px] text-[var(--color-ink-muted)]">
                  Setting location...
                </div>
              )}
              {suggestions.length > 0 && !searchLoading && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-[#e0d6ca] bg-[var(--color-parchment)]" style={{ boxShadow: "var(--shadow-float)" }}>
                  {suggestions.map((s) => (
                    <button
                      key={s.placePrediction.placeId}
                      onClick={() => selectSuggestion(s)}
                      className="w-full px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-cream)]"
                    >
                      <div className="text-xs font-medium text-[var(--color-ink)]">
                        {s.placePrediction.structuredFormat.mainText.text}
                      </div>
                      <div className="text-[10px] text-[var(--color-ink-muted)]">
                        {s.placePrediction.structuredFormat.secondaryText.text}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {settings.lat && (
        <>
          {/* Mode */}
          <div className="mt-3 flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onChange({ ...settings, mode: m.value })}
                className={`flex-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-all ${
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
                <div key={ring.label} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: ring.color, opacity: 0.7 }}
                  />
                  <span className="text-[10px] font-medium text-[var(--color-ink-muted)]">
                    {ring.label}
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

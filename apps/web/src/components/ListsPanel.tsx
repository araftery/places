"use client";

import { useState, useMemo } from "react";
import { Place, List } from "@/lib/types";
import PlaceCard from "./PlaceCard";
import type { TravelTimeBand } from "@/lib/geo";

type SortOption = "recent" | "name";

interface ListsPanelProps {
  lists: List[];
  places: Place[];
  selectedCityId: number | null;
  onCreateList: (name: string) => Promise<List>;
  onRenameList: (id: number, name: string) => Promise<void>;
  onDeleteList: (id: number) => Promise<void>;
  onTogglePlaceInList: (placeId: number, listId: number) => Promise<void>;
  onSelectPlace: (place: Place | null) => void;
  onBuildingListIdChange: (id: number | null) => void;
  travelTimes?: Map<number, TravelTimeBand>;
}

export default function ListsPanel({
  lists,
  places,
  selectedCityId,
  onCreateList,
  onRenameList,
  onDeleteList,
  onTogglePlaceInList,
  onSelectPlace,
  onBuildingListIdChange,
  travelTimes,
}: ListsPanelProps) {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState("");
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [editingDetail, setEditingDetail] = useState(false);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  // Places scoped to current city
  const cityPlaces = useMemo(
    () =>
      selectedCityId
        ? places.filter((p) => p.cityId === selectedCityId)
        : places,
    [places, selectedCityId]
  );

  // Places in the selected list
  const listPlaces = useMemo(() => {
    if (!selectedListId) return [];
    return cityPlaces.filter((p) => p.listIds?.includes(selectedListId));
  }, [cityPlaces, selectedListId]);

  // Sorted list places
  const sortedListPlaces = useMemo(() => {
    const sorted = [...listPlaces];
    switch (sortBy) {
      case "recent":
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [listPlaces, sortBy]);

  // Place counts per list
  const placeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const l of lists) {
      counts.set(
        l.id,
        cityPlaces.filter((p) => p.listIds?.includes(l.id)).length
      );
    }
    return counts;
  }, [lists, cityPlaces]);

  // List detail view
  if (selectedList) {
    return (
      <div className="flex h-full flex-col px-4">
        {/* Sticky header */}
        <div className="sticky -top-3 z-10 bg-[var(--color-sidebar-bg)] pb-2 pt-1">
          <button
            onClick={() => { setSelectedListId(null); setEditingDetail(false); }}
            className="mb-1 flex items-center gap-1 text-xs text-[var(--color-sidebar-muted)] transition-colors hover:text-[var(--color-sidebar-text)]"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Lists
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h3
                className="text-base font-semibold text-[var(--color-sidebar-text)]"
                style={{ fontFamily: "var(--font-libre-baskerville)" }}
              >
                {selectedList.name}
              </h3>
              <p className="text-[11px] text-[var(--color-sidebar-muted)]">
                {sortedListPlaces.length} place
                {sortedListPlaces.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Add places */}
              <button
                onClick={() => onBuildingListIdChange(selectedListId)}
                className="rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] p-1.5 text-[var(--color-sidebar-muted)] transition-colors hover:border-[var(--color-amber)]/50 hover:text-[var(--color-amber)]"
                title="Add places"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {/* Edit / Done */}
              <button
                onClick={() => setEditingDetail(!editingDetail)}
                className={`rounded-md border p-1.5 transition-colors ${
                  editingDetail
                    ? "border-[var(--color-amber)]/50 bg-[var(--color-amber)] text-white"
                    : "border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-[var(--color-sidebar-muted)] hover:border-[var(--color-amber)]/50 hover:text-[var(--color-amber)]"
                }`}
                title={editingDetail ? "Done editing" : "Edit list"}
              >
                {editingDetail ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {sortedListPlaces.length > 1 && !editingDetail && (
            <div className="mt-2 flex justify-end">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="appearance-none bg-transparent text-[11px] font-medium text-[var(--color-sidebar-muted)] cursor-pointer pr-4 focus:outline-none hover:text-[var(--color-sidebar-text)]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%238a7e72' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0 center",
                }}
              >
                <option value="recent">Recently added</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          )}
        </div>

        <div className="space-y-2 pb-4">
          {sortedListPlaces.map((place) => (
            <div key={place.id} className="flex items-center gap-2">
              {editingDetail && (
                <button
                  onClick={() => onTogglePlaceInList(place.id, selectedListId!)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-terracotta)]/10 hover:text-[var(--color-terracotta)]"
                  title="Remove from list"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
              <div className="min-w-0 flex-1">
                <PlaceCard
                  place={place}
                  isSelected={false}
                  onClick={() => { if (!editingDetail) onSelectPlace(place); }}
                  travelTime={travelTimes?.get(place.id)}
                  compact={sortedListPlaces.length >= 10}
                />
              </div>
            </div>
          ))}
          {sortedListPlaces.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-sidebar-muted)]">
              No places in this list yet
            </p>
          )}
        </div>
      </div>
    );
  }

  // List index view
  return (
    <div className="px-4">
      {/* New list input */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newListName.trim()) return;
          await onCreateList(newListName.trim());
          setNewListName("");
        }}
        className="mb-3 flex gap-2"
      >
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name..."
          className="flex-1 rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] px-2.5 py-1.5 text-xs text-[var(--color-sidebar-text)] placeholder-[var(--color-sidebar-muted)] focus:border-[var(--color-amber)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newListName.trim()}
          className="rounded-md bg-[var(--color-amber)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Create
        </button>
      </form>

      {/* List items */}
      <div className="space-y-1.5">
        {lists.map((list) => {
          const count = placeCounts.get(list.id) ?? 0;
          const isEditing = editingListId === list.id;

          if (isEditing) {
            return (
              <form
                key={list.id}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editingName.trim()) return;
                  await onRenameList(list.id, editingName.trim());
                  setEditingListId(null);
                }}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-amber)]/40 bg-[var(--color-sidebar-surface)] p-2.5"
              >
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] px-2 py-1 text-xs text-[var(--color-sidebar-text)] focus:border-[var(--color-amber)] focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="text-xs font-medium text-[var(--color-amber)]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingListId(null)}
                  className="text-xs text-[var(--color-sidebar-muted)]"
                >
                  Cancel
                </button>
              </form>
            );
          }

          return (
            <div
              key={list.id}
              className="group flex items-center gap-2 rounded-lg border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] transition-colors hover:border-[var(--color-sidebar-muted)]/50"
            >
              <button
                onClick={() => setSelectedListId(list.id)}
                className="flex min-w-0 flex-1 items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-sidebar-text)]">
                    {list.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-sidebar-muted)]">
                    {count} place{count !== 1 ? "s" : ""}
                  </p>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-[var(--color-sidebar-muted)]"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              {/* Actions — visible on hover */}
              <div className="flex shrink-0 items-center gap-1 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    setEditingListId(list.id);
                    setEditingName(list.name);
                  }}
                  className="rounded p-1 text-[var(--color-sidebar-muted)] hover:text-[var(--color-sidebar-text)]"
                  title="Rename"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${list.name}"?`)) onDeleteList(list.id);
                  }}
                  className="rounded p-1 text-[var(--color-sidebar-muted)] hover:text-[var(--color-terracotta)]"
                  title="Delete"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
        {lists.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-sidebar-muted)]">
            No lists yet — create one above
          </p>
        )}
      </div>
    </div>
  );
}

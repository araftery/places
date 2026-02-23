"use client";

import { useState } from "react";
import { Tag } from "@/lib/types";

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#5b7b9a", // slate blue
  "#5a7a5e", // sage
  "#c47d2e", // amber
  "#b5543b", // terracotta
  "#8a7e72", // muted brown
  "#7c5cbf", // purple
  "#d4577a", // rose
  "#2a9d8f", // teal
  "#e67e22", // orange
];

interface ManageTagsModalProps {
  open: boolean;
  onClose: () => void;
  tags: Tag[];
  onUpdateTag: (id: number, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (id: number) => Promise<void>;
}

export default function ManageTagsModal({
  open,
  onClose,
  tags,
  onUpdateTag,
  onDeleteTag,
}: ManageTagsModalProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setDeletingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await onUpdateTag(editingId, { name: editName.trim(), color: editColor });
      setEditingId(null);
      setEditName("");
      setEditColor("");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: number) {
    setSaving(true);
    try {
      await onDeleteTag(id);
      setDeletingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-ink)]/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl bg-[var(--color-parchment)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-cream)] px-5 py-4">
          <h2
            className="text-lg text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Manage Tags
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
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

        {/* Tag list */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-3 parchment-scroll">
          {tags.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
              No tags yet. Create tags when adding a place.
            </p>
          )}

          <div className="space-y-1">
            {tags.map((tag) => (
              <div key={tag.id}>
                {editingId === tag.id ? (
                  /* Edit mode */
                  <div className="rounded-lg bg-[var(--color-cream)] p-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mb-2 block w-full rounded-md border border-[var(--color-ink)]/10 bg-[var(--color-parchment)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-amber)] focus:outline-none"
                      placeholder="Tag name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                      Color
                    </p>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className="h-6 w-6 rounded-md transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c,
                            outline:
                              editColor === c
                                ? "2px solid var(--color-amber)"
                                : "2px solid transparent",
                            outlineOffset: "1px",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={saving || !editName.trim()}
                        className="rounded-md bg-[var(--color-amber)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-amber-light)] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : deletingId === tag.id ? (
                  /* Delete confirmation */
                  <div className="rounded-lg bg-[var(--color-cream)] p-3">
                    <p className="mb-2 text-sm text-[var(--color-ink)]">
                      Delete <strong>{tag.name}</strong>? It will be removed from all places.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmDelete(tag.id)}
                        disabled={saving}
                        className="rounded-md bg-[var(--color-terracotta)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-cream)]">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-sm text-[var(--color-ink)]">
                      {tag.name}
                    </span>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => startEdit(tag)}
                        className="rounded p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-amber)]"
                        title="Edit tag"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(tag.id);
                          setEditingId(null);
                        }}
                        className="rounded p-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-terracotta)]"
                        title="Delete tag"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

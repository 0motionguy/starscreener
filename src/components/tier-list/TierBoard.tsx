"use client";

// TierBoard — the drag-drop grid + unranked pool.
//
// Each item is a `useDraggable`. Each tier row + the pool are `useDroppable`s.
// On drop, we call `moveItem(repoId, target)` on the editor store. There is
// also a per-item dropdown ("place in tier") that performs the same move
// without a drag — this is the keyboard / touch fallback.

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

import {
  MIN_TIERS,
  TIER_COLORS,
  type TierColor,
} from "@/lib/tier-list/constants";
import {
  useTierListEditor,
  type PoolItem,
} from "@/lib/tier-list/client-store";

import { Avatar } from "./Avatar";

const POOL_ID = "__pool__";

interface DragItemData {
  repoId: string;
}

export function TierBoard() {
  const tiers = useTierListEditor((s) => s.tiers);
  const unranked = useTierListEditor((s) => s.unrankedItems);
  const itemMeta = useTierListEditor((s) => s.itemMeta);
  const moveItem = useTierListEditor((s) => s.moveItem);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const repoId = event.active.id;
    const overId = event.over?.id;
    if (typeof repoId !== "string" || typeof overId !== "string") return;
    if (overId === POOL_ID) {
      moveItem(repoId, "pool");
      return;
    }
    moveItem(repoId, { tierId: overId });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #2B2B2F",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {tiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tierId={tier.id}
              label={tier.label}
              color={tier.color}
              items={tier.items}
              itemMeta={itemMeta}
              canRemove={tiers.length > MIN_TIERS}
              canMoveUp={index > 0}
              canMoveDown={index < tiers.length - 1}
            />
          ))}
        </div>
        <Pool items={unranked} itemMeta={itemMeta} />
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Tier row (droppable)
// ---------------------------------------------------------------------------

function TierRow({
  tierId,
  label,
  color,
  items,
  itemMeta,
  canRemove,
  canMoveUp,
  canMoveDown,
}: {
  tierId: string;
  label: string;
  color: TierColor;
  items: string[];
  itemMeta: Record<string, PoolItem>;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: tierId,
    data: { kind: "tier" },
  });
  const setColor = useTierListEditor((s) => s.setTierColor);
  const setLabel = useTierListEditor((s) => s.setTierLabel);
  const removeTier = useTierListEditor((s) => s.removeTier);
  const moveTier = useTierListEditor((s) => s.moveTier);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className="group/tier"
      style={{
        display: "flex",
        minHeight: 88,
        backgroundColor: isOver ? "#1f1f24" : "transparent",
        borderBottom: "1px solid #2B2B2F",
        transition: "background-color 0.15s ease",
      }}
    >
      <div
        style={{
          width: 80,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color,
          position: "relative",
        }}
      >
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(tierId, e.target.value.slice(0, 8))}
          aria-label={`Rename tier ${label}`}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#0a0a0a",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 800,
            fontSize: 28,
            textAlign: "center",
          }}
        />
        {/* Chrome buttons (⋯ ▲ ▼ ×) sit invisible at rest and fade in when
            the row is hovered or one of the buttons is focused. Keeps the
            colored swatch reading as a clean letter chip while the controls
            remain reachable. */}
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Change tier color"
          className="opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: 9,
            border: "1px solid rgba(0,0,0,0.3)",
            backgroundColor: "rgba(0,0,0,0.15)",
            color: "#0a0a0a",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ⋯
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeTier(tierId)}
            aria-label={`Remove tier ${label}`}
            title="Remove tier (items move back to pool)"
            className="opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={{
              position: "absolute",
              bottom: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              border: "1px solid rgba(0,0,0,0.3)",
              backgroundColor: "rgba(0,0,0,0.15)",
              color: "#0a0a0a",
              fontSize: 12,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        )}
        {canMoveUp && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "up")}
            aria-label={`Move tier ${label} up`}
            title="Move row up"
            className="opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={tierReorderButtonStyle({ position: "top" })}
          >
            ▲
          </button>
        )}
        {canMoveDown && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "down")}
            aria-label={`Move tier ${label} down`}
            title="Move row down"
            className="opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={tierReorderButtonStyle({ position: "bottom" })}
          >
            ▼
          </button>
        )}
        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              top: 26,
              right: 4,
              zIndex: 10,
              display: "flex",
              gap: 4,
              padding: 6,
              backgroundColor: "#1b1b1e",
              border: "1px solid #2B2B2F",
              borderRadius: 4,
            }}
          >
            {TIER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                onClick={() => {
                  setColor(tierId, c);
                  setPickerOpen(false);
                }}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border:
                    c === color
                      ? "2px solid #FBFBFB"
                      : "1px solid rgba(255,255,255,0.2)",
                  background: c,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          gap: 8,
          padding: 12,
        }}
      >
        {items.length === 0 ? (
          <span
            style={{
              alignSelf: "center",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "#5A5A5C",
            }}
          >
            drop or place items here
          </span>
        ) : (
          items.map((repoId) => (
            <DraggableCell
              key={repoId}
              repoId={repoId}
              meta={itemMeta[repoId]}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool (droppable)
// ---------------------------------------------------------------------------

function Pool({
  items,
  itemMeta,
}: {
  items: string[];
  itemMeta: Record<string, PoolItem>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: POOL_ID,
    data: { kind: "pool" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        border: "1px dashed #2B2B2F",
        borderRadius: 4,
        padding: 12,
        backgroundColor: isOver ? "#1f1f24" : "transparent",
        minHeight: 96,
        transition: "background-color 0.15s ease",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          color: "#878787",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {`// unranked · ${items.length}`}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.length === 0 ? (
          <span
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "#5A5A5C",
            }}
          >
            search above to add repos
          </span>
        ) : (
          items.map((repoId) => (
            <DraggableCell
              key={repoId}
              repoId={repoId}
              meta={itemMeta[repoId]}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable cell
// ---------------------------------------------------------------------------

function DraggableCell({
  repoId,
  meta,
}: {
  repoId: string;
  meta?: PoolItem;
}) {
  const tiers = useTierListEditor((s) => s.tiers);
  const moveItem = useTierListEditor((s) => s.moveItem);
  const removeItem = useTierListEditor((s) => s.removeItem);
  const openPicker = useTierListEditor((s) => s.openPicker);
  const data: DragItemData = { repoId };
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: repoId,
      data,
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 6px 4px 4px",
    backgroundColor: "#13161a",
    border: "1px solid #272c33",
    borderRadius: 3,
    touchAction: "none",
    height: 32,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group">
      {/* Desktop: drag handle. Mobile: tap button → picker bottom-sheet. */}
      <button
        type="button"
        aria-label={`Drag handle for ${repoId}`}
        {...listeners}
        className="hidden md:inline-flex items-center bg-transparent border-0 p-0 cursor-grab"
      >
        <Avatar repoId={repoId} avatarUrl={meta?.avatarUrl} size={24} rounded={3} />
      </button>
      <button
        type="button"
        aria-label={`Place ${repoId} into a tier`}
        onClick={() => openPicker(repoId)}
        className="inline-flex md:hidden items-center bg-transparent border-0 p-0 cursor-pointer"
      >
        <Avatar repoId={repoId} avatarUrl={meta?.avatarUrl} size={24} rounded={3} />
      </button>
      <span
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          color: "#FBFBFB",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={repoId}
      >
        {repoId}
      </span>
      {typeof meta?.stars === "number" && meta.stars > 0 && (
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            color: "#7d848c",
            paddingLeft: 6,
            borderLeft: "1px solid #272c33",
          }}
        >
          {compactStars(meta.stars)}
        </span>
      )}
      {/* Controls — hidden until hover/focus to keep the pill clean.
          On touch devices `:hover` doesn't fire, so the picker bottom-sheet
          is the primary touch path; these stay tucked away there. */}
      <div
        className="hidden group-hover:flex group-focus-within:flex"
        style={{
          alignItems: "center",
          gap: 4,
          marginLeft: 2,
          paddingLeft: 6,
          borderLeft: "1px solid #272c33",
        }}
      >
        <select
          aria-label={`Place ${repoId} in tier`}
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            if (value === POOL_ID) moveItem(repoId, "pool");
            else moveItem(repoId, { tierId: value });
          }}
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            backgroundColor: "#1b1b1e",
            color: "#FBFBFB",
            border: "1px solid #272c33",
            borderRadius: 2,
            padding: "1px 2px",
          }}
        >
          <option value="">→</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.label}
            </option>
          ))}
          <option value={POOL_ID}>pool</option>
        </select>
        <button
          type="button"
          aria-label={`Remove ${repoId}`}
          onClick={() => removeItem(repoId)}
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            backgroundColor: "transparent",
            color: "#878787",
            border: "1px solid #272c33",
            borderRadius: 2,
            padding: "1px 4px",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function compactStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function tierReorderButtonStyle(opts: {
  position: "top" | "bottom";
}): React.CSSProperties {
  return {
    position: "absolute",
    [opts.position]: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    border: "1px solid rgba(0,0,0,0.3)",
    backgroundColor: "rgba(0,0,0,0.15)",
    color: "#0a0a0a",
    fontSize: 9,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

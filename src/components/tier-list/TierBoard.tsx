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
  MAX_TIERS,
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
  const addTier = useTierListEditor((s) => s.addTier);

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
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tierId={tier.id}
              label={tier.label}
              color={tier.color}
              items={tier.items}
              itemMeta={itemMeta}
              canRemove={tiers.length > MIN_TIERS}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addTier}
          disabled={tiers.length >= MAX_TIERS}
          style={{
            alignSelf: "flex-start",
            padding: "4px 10px",
            backgroundColor: "#262626",
            color: "#FBFBFB",
            border: "1px dashed #2B2B2F",
            borderRadius: 2,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            cursor: tiers.length >= MAX_TIERS ? "not-allowed" : "pointer",
            opacity: tiers.length >= MAX_TIERS ? 0.4 : 1,
          }}
        >
          + add row
        </button>
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
}: {
  tierId: string;
  label: string;
  color: TierColor;
  items: string[];
  itemMeta: Record<string, PoolItem>;
  canRemove: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: tierId,
    data: { kind: "tier" },
  });
  const setColor = useTierListEditor((s) => s.setTierColor);
  const setLabel = useTierListEditor((s) => s.setTierLabel);
  const removeTier = useTierListEditor((s) => s.removeTier);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
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
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Change tier color"
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
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: 6,
    width: 96,
    backgroundColor: "#1b1b1e",
    border: "1px solid #2B2B2F",
    borderRadius: 4,
    touchAction: "none",
  };

  const displayName = meta?.displayName ?? repoId.split("/").pop() ?? repoId;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <button
        type="button"
        aria-label={`Drag handle for ${repoId}`}
        {...listeners}
        style={{
          all: "unset",
          cursor: "grab",
        }}
      >
        <Avatar repoId={repoId} avatarUrl={meta?.avatarUrl} size={48} />
      </button>
      <span
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          color: "#FBFBFB",
          maxWidth: 88,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={repoId}
      >
        {displayName}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
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
            backgroundColor: "#262626",
            color: "#FBFBFB",
            border: "1px solid #2B2B2F",
            borderRadius: 2,
            padding: "1px 2px",
          }}
        >
          <option value="">→ tier</option>
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
            border: "1px solid #2B2B2F",
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

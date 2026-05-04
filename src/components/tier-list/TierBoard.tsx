"use client";

// TierBoard - drag-drop grid and unranked pool.

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
      <div className="tier-board-shell">
        <div className="tier-board">
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
      className="tier-row group/tier"
      style={{ backgroundColor: isOver ? "var(--bg-050)" : undefined }}
    >
      <div className="tier-letter" style={{ backgroundColor: color }}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(tierId, e.target.value.slice(0, 8))}
          aria-label={`Rename tier ${label}`}
          className="tier-letter-input"
        />
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Change tier color"
          className="tier-row-chrome tier-row-chrome-top tier-row-chrome-right opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          ...
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeTier(tierId)}
            aria-label={`Remove tier ${label}`}
            title="Remove tier (items move back to pool)"
            className="tier-row-chrome tier-row-chrome-bottom tier-row-chrome-right opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            x
          </button>
        )}
        {canMoveUp && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "up")}
            aria-label={`Move tier ${label} up`}
            title="Move row up"
            className="tier-row-chrome tier-row-chrome-top tier-row-chrome-left opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            ^
          </button>
        )}
        {canMoveDown && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "down")}
            aria-label={`Move tier ${label} down`}
            title="Move row down"
            className="tier-row-chrome tier-row-chrome-bottom tier-row-chrome-left opacity-0 group-hover/tier:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            v
          </button>
        )}
        {pickerOpen && (
          <div className="tier-color-picker">
            {TIER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                onClick={() => {
                  setColor(tierId, c);
                  setPickerOpen(false);
                }}
                className={c === color ? "is-active" : undefined}
                style={{ background: c }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="tier-drop">
        {items.length === 0 ? (
          <span className="tier-empty">drop or place items here</span>
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
      className="tier-pool"
      style={{ backgroundColor: isOver ? "var(--bg-050)" : undefined }}
    >
      <div className="tier-pool-title">{`// unranked / ${items.length}`}</div>
      <div className="tier-pool-items">
        {items.length === 0 ? (
          <span className="tier-empty">search above to add repos</span>
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
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="tier-item group">
      <button
        type="button"
        aria-label={`Drag handle for ${repoId}`}
        {...listeners}
        className="hidden md:inline-flex items-center bg-transparent border-0 p-0 cursor-grab"
      >
        <Avatar repoId={repoId} avatarUrl={meta?.avatarUrl} size={24} rounded={2} />
      </button>
      <button
        type="button"
        aria-label={`Place ${repoId} into a tier`}
        onClick={() => openPicker(repoId)}
        className="inline-flex md:hidden items-center bg-transparent border-0 p-0 cursor-pointer"
      >
        <Avatar repoId={repoId} avatarUrl={meta?.avatarUrl} size={24} rounded={2} />
      </button>
      <span className="nm" title={repoId}>
        {repoId}
      </span>
      {typeof meta?.stars === "number" && meta.stars > 0 && (
        <span className="stars">{compactStars(meta.stars)}</span>
      )}
      <div className="tier-item-controls hidden group-hover:flex group-focus-within:flex">
        <select
          aria-label={`Place ${repoId} in tier`}
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            if (value === POOL_ID) moveItem(repoId, "pool");
            else moveItem(repoId, { tierId: value });
          }}
        >
          <option value="">to</option>
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
        >
          x
        </button>
      </div>
    </div>
  );
}

function compactStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

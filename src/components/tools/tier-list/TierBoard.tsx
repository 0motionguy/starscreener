"use client";

// TierBoard — drag-drop grid and unranked pool for the tier-list editor.
// Mounts a single DndContext that scopes every <DraggableCell> + every
// <TierRow> droppable. Mobile UX falls through to <MobileTierPicker> via the
// tap-button alternative on each cell.
//
// Restored from audit/imp-wave-10c-tierlist into the canonical tools subtree.
// dnd-kit wiring + state-machine preserved verbatim per the task brief —
// only restyle (token vars, Icon registry, new primitive classes) was in
// scope.

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

import { Icon } from "@/lib/icons";
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
      className={`tier-row${isOver ? " is-over" : ""}`}
      data-tier-id={tierId}
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
          className="tier-row-chrome tier-row-chrome--top-right"
          title="Change row color"
        >
          <Icon name="more-horizontal" size="xs" />
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeTier(tierId)}
            aria-label={`Remove tier ${label}`}
            title="Remove tier (items move back to pool)"
            className="tier-row-chrome tier-row-chrome--bottom-right"
          >
            <Icon name="trash" size="xs" />
          </button>
        )}
        {canMoveUp && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "up")}
            aria-label={`Move tier ${label} up`}
            title="Move row up"
            className="tier-row-chrome tier-row-chrome--top-left"
          >
            <Icon name="chevron-up" size="xs" />
          </button>
        )}
        {canMoveDown && (
          <button
            type="button"
            onClick={() => moveTier(tierId, "down")}
            aria-label={`Move tier ${label} down`}
            title="Move row down"
            className="tier-row-chrome tier-row-chrome--bottom-left"
          >
            <Icon name="chevron-down" size="xs" />
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
          <span className="tier-drop-empty">
            <span aria-hidden className="tier-drop-empty-plus">+</span>
            <span>{"// drop or place items here"}</span>
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
  const hasItems = items.length > 0;
  return (
    <div
      ref={setNodeRef}
      className={`tier-pool${isOver ? " is-over" : ""}${hasItems ? " has-items" : ""}`}
    >
      <div className="tier-pool-title">
        <span>{`// unranked / ${items.length}`}</span>
        <span className="tier-pool-hint">
          search above to add repos
        </span>
      </div>
      <div className="tier-pool-items">
        {hasItems ? (
          items.map((repoId) => (
            <DraggableCell
              key={repoId}
              repoId={repoId}
              meta={itemMeta[repoId]}
            />
          ))
        ) : (
          <span className="tier-pool-empty">
            {"// no items yet — search above to add a repo"}
          </span>
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Drag ${repoId} into a tier — or tap to open the mobile picker`}
      onClick={() => {
        // Mobile fallback: tap-to-place picker. Pointer drag bypasses click
        // via dnd-kit's activation constraint (4px distance) so a real drag
        // doesn't fire this on desktop.
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
          openPicker(repoId);
        }
      }}
      className="chip tier-item"
    >
      <span className="tier-item-handle" aria-hidden>
        <Avatar
          repoId={repoId}
          avatarUrl={meta?.avatarUrl}
          size={60}
          rounded={4}
        />
      </span>
      <span className="tier-item-name" title={repoId}>
        {repoId}
      </span>
      {typeof meta?.stars === "number" && meta.stars > 0 && (
        <span className="tier-item-stars">{compactStars(meta.stars)}</span>
      )}
      <button
        type="button"
        aria-label={`Remove ${repoId}`}
        onClick={(e) => {
          e.stopPropagation();
          removeItem(repoId);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="tier-item-remove"
      >
        <Icon name="x-circle" size="sm" />
      </button>
    </div>
  );
}

function compactStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

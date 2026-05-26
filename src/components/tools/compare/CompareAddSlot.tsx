"use client";

// CompareAddSlot — empty-slot ghost pill that, when clicked, focuses the
// CompareSearchPicker at the top of the page via a custom event. Beats
// linking back to `/` (the previous behavior) because the user is already
// on the compare surface — they just need a search box, not a redirect.

import { Icon } from "@/lib/icons";

interface Props {
  index: number;
}

export function CompareAddSlot({ index }: Props) {
  return (
    <button
      type="button"
      className="cmp-chip-add"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("compare:focus-search"));
      }}
      aria-label={`Add repo to slot ${index}`}
      title="Search and add a repo"
    >
      <Icon name="plus" size="sm" /> Add repo
    </button>
  );
}

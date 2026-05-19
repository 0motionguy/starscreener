// CategoryFilterPills — pill row with per-category counts.
// URL contract: ?cat=<id>. Falls back to "all" if param is missing.

import Link from "next/link";

interface CategoryPillItem {
  id: string;
  label: string;
  count: number;
}

interface CategoryFilterPillsProps {
  items: CategoryPillItem[];
  selectedId: string;
}

export function CategoryFilterPills({
  items,
  selectedId,
}: CategoryFilterPillsProps) {
  return (
    <div className="cat-pills">
      {items.map((item) => {
        const on = item.id === selectedId;
        return (
          <Link
            key={item.id}
            href={{ query: { cat: item.id } }}
            className={`cat-pill ${on ? "on" : ""}`}
            prefetch={false}
          >
            {item.label}
            <span className="ct">{item.count.toLocaleString()}</span>
          </Link>
        );
      })}
    </div>
  );
}

export type { CategoryPillItem };

// RepoBreadcrumb — visible server-rendered breadcrumb for /repo/[owner]/[name].
//
// Why: BreadcrumbList JSON-LD already exists in lib/seo-repo-schemas.ts but
// there was no DOM breadcrumb. Adding visible server-rendered breadcrumb
// gives Googlebot 2-3 NEW internal links per repo page (1,700-2,500
// sitewide) AND matches the schema breadcrumb so structured data and DOM
// agree. Crawl-budget recovery move.
//
// Server Component. Renders nothing if categoryId/category lookup fails
// — it gracefully degrades to Home > {repo name}.

import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";

interface RepoBreadcrumbProps {
  owner: string;
  name: string;
  categoryId?: string | null;
}

export function RepoBreadcrumb({
  owner,
  name,
  categoryId,
}: RepoBreadcrumbProps) {
  const category = categoryId
    ? CATEGORIES.find((c) => c.id === categoryId)
    : null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="repo-breadcrumb"
      style={{
        padding: "0.5rem 0",
        fontSize: 12,
        color: "var(--v4-ink-300, var(--v3-ink-300))",
      }}
    >
      <ol
        style={{
          display: "flex",
          gap: 6,
          listStyle: "none",
          padding: 0,
          margin: 0,
          flexWrap: "wrap",
        }}
      >
        <li>
          <Link
            href="/"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            Home
          </Link>
        </li>
        {category && (
          <li>
            <span aria-hidden style={{ margin: "0 4px" }}>
              ›
            </span>
            <Link
              href={`/categories/${category.id}`}
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {category.name}
            </Link>
          </li>
        )}
        <li>
          <span aria-hidden style={{ margin: "0 4px" }}>
            ›
          </span>
          <span aria-current="page">
            {owner}/{name}
          </span>
        </li>
      </ol>
    </nav>
  );
}

export default RepoBreadcrumb;

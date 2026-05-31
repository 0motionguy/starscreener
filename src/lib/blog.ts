// Blog content layer — reads MDX posts from content/blog/*.mdx.
//
// Posts are authored as plain MDX with YAML frontmatter (no CMS). Reads
// happen at build time (generateStaticParams + the page, with
// dynamicParams=false), so the standalone server needs no runtime fs access.
// gray-matter parses frontmatter; the body MDX is rendered by
// next-mdx-remote/rsc on the page.

import "server-only";

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const BLOG_DIR = join(process.cwd(), "content", "blog");

export interface BlogFrontmatter {
  title: string;
  description: string;
  /** ISO date string, e.g. "2026-05-28". */
  date: string;
  /** ISO date of last meaningful update. Defaults to `date`. */
  updated?: string;
  author?: string;
  tags?: string[];
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string;
}

export interface BlogPost extends BlogPostMeta {
  /** Raw MDX body (frontmatter stripped). */
  body: string;
}

function readAll(): BlogPost[] {
  if (!existsSync(BLOG_DIR)) return [];
  const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));
  const posts: BlogPost[] = [];
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const raw = readFileSync(join(BLOG_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const fm = data as Partial<BlogFrontmatter>;
    if (!fm.title || !fm.description || !fm.date) continue; // skip malformed
    posts.push({
      slug,
      title: fm.title,
      description: fm.description,
      date: fm.date,
      updated: fm.updated ?? fm.date,
      author: fm.author ?? "TrendingRepo",
      tags: fm.tags ?? [],
      body: content,
    });
  }
  // Newest first.
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

export function getAllPostsMeta(): BlogPostMeta[] {
  return readAll().map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    updated: p.updated,
    author: p.author,
    tags: p.tags,
  }));
}

export function getAllSlugs(): string[] {
  return readAll().map((p) => p.slug);
}

export function getPostBySlug(slug: string): BlogPost | null {
  return readAll().find((p) => p.slug === slug) ?? null;
}

// Source feed panel — one component, three render variants.
//
// "list"   — HN, GH, Reddit (rank · title · author · age · score)
// "tweet"  — X, Bluesky    (avatar · who · text · stats)
// "rss"    — Dev.to, Claude RSS, OpenAI RSS (category · title · description · meta)
//
// Reuses .feed-row / .tweet-row / .rss-row classes already defined in
// src/app/globals.css so the visual language matches the rest of the
// terminal pages.

import Link from "next/link";
import type { ReactNode } from "react";
import type { SourceKey } from "@/lib/signals/types";
import { Card, CardHeader } from "@/components/ui/Card";

type Variant = "list" | "tweet" | "rss";

export interface ListItem {
  id: string;
  title: string;
  href: string;
  external: boolean;
  attribution: string;
  age: string;
  pts: string;
  chg: string | null;
  chgDown?: boolean;
}

export interface TweetItem {
  id: string;
  avatar: string;
  name: string;
  handle: string;
  age: string;
  text: string;
  stats: Array<{ label: string; value: string }>;
  href: string;
}

export interface RssArticleItem {
  id: string;
  category: string;
  catColor: string;
  title: string;
  desc: string;
  href: string;
  author: string;
  age: string;
  reads: string | null;
}

type FeedItems =
  | { variant: "list"; items: ListItem[] }
  | { variant: "tweet"; items: TweetItem[] }
  | { variant: "rss"; items: RssArticleItem[] };

const SOURCE_COLOR: Record<SourceKey, string> = {
  hn: "var(--source-hackernews)",
  github: "var(--source-github)",
  x: "var(--source-x)",
  reddit: "var(--source-reddit)",
  bluesky: "var(--source-bluesky)",
  devto: "var(--source-dev)",
  claude: "var(--source-claude)",
  openai: "var(--source-openai)",
};

export interface SourceFeedPanelProps {
  source: SourceKey;
  title: string;
  countLabel: string;
  freshLabel: string;
  footerHref: string;
  footerLabel: string;
  feed: FeedItems;
}

export function SourceFeedPanel({
  source,
  title,
  countLabel,
  freshLabel,
  footerHref,
  footerLabel,
  feed,
}: SourceFeedPanelProps) {
  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader
        right={
          <>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{countLabel}</span>
            <span className="live">LIVE</span>
          </>
        }
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            background: SOURCE_COLOR[source],
            marginRight: 8,
            verticalAlign: "middle",
          }}
        />
        {title}
      </CardHeader>

      <div className="ds-card-body" style={{ padding: 0 }}>
        {feed.variant === "list" ? <ListFeed items={feed.items} /> : null}
        {feed.variant === "tweet" ? <TweetFeed items={feed.items} /> : null}
        {feed.variant === "rss" ? <RssFeed items={feed.items} /> : null}
      </div>

      <div
        style={{
          padding: "7px 12px",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: 9,
          letterSpacing: "0.20em",
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>{freshLabel}</span>
        <FooterLink href={footerHref}>{footerLabel}</FooterLink>
      </div>
    </Card>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const isExternal = /^https?:\/\//.test(href);
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
      >
        {children} →
      </a>
    );
  }
  return (
    <Link href={href} style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
      {children} →
    </Link>
  );
}

function FeedRowLink({
  href,
  external,
  children,
  className,
}: {
  href: string;
  external: boolean;
  children: ReactNode;
  className: string;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

function ListFeed({ items }: { items: ListItem[] }) {
  if (items.length === 0) return <EmptyMessage />;
  return (
    <>
      {items.slice(0, 7).map((it, i) => (
        <FeedRowLink
          key={it.id}
          href={it.href}
          external={it.external}
          className={`feed-row ${i === 0 ? "first" : ""}`}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1fr 60px",
              gap: 8,
              padding: "8px 12px",
              alignItems: "flex-start",
            }}
          >
            <div className="rk" style={{ paddingTop: 1, fontSize: 10 }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                className="ttl"
                style={{
                  whiteSpace: "normal",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  lineHeight: 1.35,
                }}
              >
                {it.title}
              </div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 3,
                }}
              >
                <span style={{ color: "var(--color-text-muted)", textTransform: "none" }}>
                  {it.attribution}
                </span>
                <span>· {it.age}</span>
              </div>
            </div>
            <div
              style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--color-text-default)",
              }}
            >
              {it.pts}
              {it.chg ? (
                <span
                  style={{
                    display: "block",
                    fontSize: 9,
                    letterSpacing: "0.10em",
                    marginTop: 1,
                    color: it.chgDown
                      ? "var(--color-negative)"
                      : "var(--color-positive)",
                  }}
                >
                  {it.chg}
                </span>
              ) : null}
            </div>
          </div>
        </FeedRowLink>
      ))}
    </>
  );
}

function TweetFeed({ items }: { items: TweetItem[] }) {
  if (items.length === 0) return <EmptyMessage />;
  return (
    <>
      {items.slice(0, 5).map((t) => (
        <FeedRowLink
          key={t.id}
          href={t.href}
          external
          className="tweet-row"
        >
          <div style={{ padding: "10px 12px", display: "flex", gap: 9 }}>
            <div
              className="av"
              style={{
                width: 22,
                height: 22,
                flex: "none",
                borderRadius: 99,
                background: "var(--color-bg-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                color: "var(--color-text-default)",
                fontWeight: 600,
              }}
            >
              {t.avatar}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--color-text-muted)",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--color-text-default)", fontWeight: 600 }}>
                  {t.name}
                </span>
                <span style={{ color: "var(--color-text-subtle)" }}>{t.handle}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: "var(--color-text-subtle)",
                    fontSize: 9.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {t.age}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  color: "var(--color-text-default)",
                  lineHeight: 1.4,
                  marginTop: 3,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.text}
              </div>
              <div
                className="stats"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  display: "flex",
                  gap: 12,
                  marginTop: 4,
                }}
              >
                {t.stats.map((s) => (
                  <span key={s.label}>
                    <b style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>
                      {s.value}
                    </b>{" "}
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FeedRowLink>
      ))}
    </>
  );
}

function RssFeed({ items }: { items: RssArticleItem[] }) {
  if (items.length === 0) return <EmptyMessage />;
  return (
    <>
      {items.slice(0, 4).map((a) => (
        <FeedRowLink key={a.id} href={a.href} external className="rss-row">
          <div
            style={{
              padding: "9px 12px",
              borderBottom: "1px solid var(--color-border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.20em",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  background: a.catColor,
                  display: "inline-block",
                }}
              />
              {a.category}
            </div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--color-text-default)",
                lineHeight: 1.32,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              {a.title}
            </div>
            {a.desc ? (
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11.5,
                  color: "var(--color-text-subtle)",
                  lineHeight: 1.45,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {a.desc}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                display: "flex",
                gap: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span>{a.author}</span>
              <span>· {a.age}</span>
              {a.reads ? (
                <span style={{ marginLeft: "auto" }}>{a.reads} reads</span>
              ) : null}
            </div>
          </div>
        </FeedRowLink>
      ))}
    </>
  );
}

function EmptyMessage() {
  return (
    <div
      style={{
        padding: "24px 14px",
        color: "var(--color-text-subtle)",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.10em",
        textAlign: "center",
      }}
    >
      no recent items — collector warming up
    </div>
  );
}

export default SourceFeedPanel;

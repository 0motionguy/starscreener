// Drizzle schema — `newsletter_subscribers` table.
//
// Anonymous email capture, completely separate from `profiles`. Powers the
// homepage hero capture form. Pipeline:
//
//   1. POST /api/newsletter/subscribe { email } → row inserted with
//      confirmed_at = NULL and confirm_token_hash set. Confirmation email
//      sent via Resend.
//   2. GET  /api/newsletter/confirm?t=<token> → token verified against
//      the row's hash, confirmed_at = now(), redirect to /thanks.
//   3. Weekly digest cron sends to confirmed-AND-not-unsubscribed rows
//      with the public top-breakouts digest + "create account for
//      personalised alerts" CTA.
//   4. GET /api/newsletter/unsubscribe?t=<token> → unsubscribed_at = now().
//
// Double-opt-in is mandatory in v1 — keeps domain reputation clean even
// if a malicious actor enters a friend's email at the form. Subscribers
// receive zero email until confirmed.

import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    source: text("source").notNull(), // 'hero' | 'footer' | 'modal' | 'inline-cta'
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    confirmTokenHash: text("confirm_token_hash").notNull(),
    unsubscribeToken: text("unsubscribe_token").notNull(),
  },
  (t) => [
    uniqueIndex("newsletter_email_uniq").on(t.email),
    index("newsletter_unsub_token_idx").on(t.unsubscribeToken),
  ],
);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber =
  typeof newsletterSubscribers.$inferInsert;

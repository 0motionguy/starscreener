// Clerk <SignIn /> / <SignUp /> appearance: matches trendingrepo's
// dark canvas + Liquid Lava accent. The root layout owns the single
// ClerkProvider used by the header account CTA and hosted auth pages.
//
// Variables map to Clerk's high-level theme tokens; elements override
// individual sub-component class names where a token can't reach
// (card chrome, social buttons, inputs).

import type { Appearance } from "@clerk/types";

// Sourced from public/shell.css :root + docs/DESIGN-SYSTEM.md §2.
// Keep in sync when tokens move there. As of Revive 2026-05-23 the text
// ramp shifted to the slate values below.
const TOKENS = {
  bgCanvas: "#08090a",
  bgShell: "#0b0d0f",
  bgRaised: "#101418",
  bgMuted: "#151a20",
  bgFill: "#1d242b",
  borderSubtle: "#1a2026",
  borderDefault: "#222a32",
  borderHover: "#4d5865",
  textDefault: "#f1f5f9",
  textSubtle: "#6b7785",
  textFaint: "#4a5562",
  accent: "#ff6b35",
  accentHover: "#ff8458",
  accentSoft: "rgba(255, 107, 53, 0.14)",
  positive: "#22c55e",
  negative: "#ff4d4d",
  warning: "#ffb547",
} as const;

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: TOKENS.accent,
    colorBackground: TOKENS.bgShell,
    colorText: TOKENS.textDefault,
    colorTextSecondary: TOKENS.textSubtle,
    colorInputBackground: TOKENS.bgRaised,
    colorInputText: TOKENS.textDefault,
    colorNeutral: TOKENS.textSubtle,
    colorDanger: TOKENS.negative,
    colorSuccess: TOKENS.positive,
    colorWarning: TOKENS.warning,
    colorShimmer: TOKENS.accentSoft,
    fontFamily: "var(--font-geist), system-ui, -apple-system, sans-serif",
    fontFamilyButtons:
      "var(--font-geist), system-ui, -apple-system, sans-serif",
    fontSize: "0.9375rem",
    fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    borderRadius: "0.125rem",
    spacingUnit: "1rem",
  },
  // 2026-06-11 (Wave C, unification) — every className string now reads
  // from the v6 token table. The TOKENS const above stays literal because
  // Clerk's `variables` API needs concrete colors (CSS vars don't resolve
  // through Clerk's internal style computation), but every
  // Tailwind-arbitrary value below uses var(--*). Accent-with-opacity
  // resolves via color-mix() so the brand token still owns the hue and
  // a future token bump propagates without code change.
  elements: {
    rootBox: "w-full max-w-md mx-auto",
    card: [
      "bg-[var(--shell)]",
      "border border-[var(--border)]",
      "shadow-none",
      "rounded",
    ].join(" "),
    cardBox: "bg-transparent",
    headerTitle:
      "text-[var(--fg)] text-2xl font-semibold tracking-tight font-[var(--font-space-grotesk)]",
    headerSubtitle: "text-[var(--fg-subtle)] text-sm",
    // Force a vertical stack of social buttons — Clerk's modal default
    // packs them into a 3-column grid when there are 2-3 providers, which
    // truncates labels ("Goog..." "X / T..."). One per row + bigger
    // padding makes them the primary CTA pattern.
    socialButtons:
      "!grid-cols-1 !flex !flex-col gap-3 w-full",
    socialButtonsBlockButton: [
      "w-full",
      "!border !border-[color-mix(in_srgb,_var(--accent)_40%,_transparent)]",
      "bg-[var(--surface)] hover:bg-[var(--border-subtle)]",
      "hover:!border-[var(--accent)]",
      "!text-white",
      "!py-5 px-6",
      "transition-colors",
      "justify-start gap-4",
      "min-h-[60px]",
    ].join(" "),
    socialButtonsBlockButtonText:
      "!text-white !font-bold !text-[17px]",
    socialButtonsProviderIcon:
      "!opacity-100 !w-7 !h-7 !brightness-100",
    // Per-provider icon overrides: GitHub + X marks are monochrome
    // BLACK silhouettes — invisible on our #101418 button bg. Invert
    // them to white. Google stays untouched (its mark is multicolor).
    socialButtonsProviderIcon__github: "!invert",
    socialButtonsProviderIcon__x: "!invert",
    socialButtonsProviderIcon__twitter: "!invert",
    // Operator decree 2026-05-31: social-only Sign up modal. The plain
    // "hidden" Tailwind class lost the specificity war with Clerk's
    // own display:flex; switching to "!hidden" forces display:none!important.
    dividerRow: "!hidden",
    dividerLine: "!hidden",
    dividerText: "!hidden",
    form: "!hidden",
    formField: "!hidden",
    formFieldRow: "!hidden",
    formButtonPrimary: "!hidden",
    formFieldLabel: "!hidden",
    formFieldInput: "!hidden",
    formFieldAction: "!hidden",
    formResendCodeLink: "!hidden",
    // Form sub-element styling intentionally pruned — the parent
    // `form: "!hidden"` removes the whole tree from the modal, so
    // formFieldLabel/Input/etc. would never paint anyway. Kept the
    // footer/identityPreview rules below since those still render.
    formButtonReset:
      "text-[var(--fg-subtle)] hover:text-[var(--fg)] transition-colors",
    footer: "bg-transparent",
    footerAction: "text-[var(--fg-subtle)]",
    footerActionText: "text-[var(--fg-subtle)] text-sm",
    footerActionLink: [
      "text-[var(--accent)] hover:text-[var(--accent-hover)]",
      "font-medium",
      "transition-colors",
    ].join(" "),
    identityPreview:
      "bg-[var(--surface)] border border-[var(--border)] rounded-lg",
    identityPreviewText: "text-[var(--fg)]",
    identityPreviewEditButton:
      "text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors",
    otpCodeFieldInput: [
      "bg-[var(--surface)] border border-[var(--border)]",
      "text-[var(--fg)]",
      "focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,_var(--accent)_30%,_transparent)]",
    ].join(" "),
    alert: "bg-[var(--surface-3)] border border-[var(--border)] text-[var(--fg)]",
    alertText: "text-[var(--fg)]",
    badge: "bg-[var(--surface)] text-[var(--fg)] border border-[var(--border)]",
    avatarBox: "border border-[var(--border)]",
    userButtonAvatarBox: "w-8 h-8 border border-[var(--border)]",
    userButtonTrigger: [
      "rounded focus:outline-none",
      "focus:ring-2 focus:ring-[color-mix(in_srgb,_var(--accent)_40%,_transparent)]",
    ].join(" "),
    userButtonPopoverCard: [
      "bg-[var(--shell)]",
      "border border-[var(--border)]",
      "shadow-2xl shadow-black/60",
    ].join(" "),
    userButtonPopoverActionButton:
      "text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors",
    userButtonPopoverActionButtonText: "text-[var(--fg)]",
    userButtonPopoverActionButtonIcon: "text-[var(--fg-subtle)]",
    userButtonPopoverFooter: "bg-[var(--bg)] border-t border-[var(--border)]",
  },
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    showOptionalFields: true,
    privacyPageUrl: "/privacy",
    termsPageUrl: "/terms",
  },
};

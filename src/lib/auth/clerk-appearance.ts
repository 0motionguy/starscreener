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
  elements: {
    rootBox: "w-full max-w-md mx-auto",
    card: [
      "bg-[#0b0d0f]",
      "border border-[#222a32]",
      "shadow-none",
      "rounded",
    ].join(" "),
    cardBox: "bg-transparent",
    headerTitle:
      "text-[#f1f5f9] text-2xl font-semibold tracking-tight font-[var(--font-space-grotesk)]",
    headerSubtitle: "text-[#6b7785] text-sm",
    // Force a vertical stack of social buttons — Clerk's modal default
    // packs them into a 3-column grid when there are 2-3 providers, which
    // truncates labels ("Goog..." "X / T..."). One per row + bigger
    // padding makes them the primary CTA pattern.
    socialButtons:
      "!grid-cols-1 !flex !flex-col gap-3 w-full",
    socialButtonsBlockButton: [
      "w-full",
      "!border !border-[#ff6b35]/40",
      "bg-[#101418] hover:bg-[#1a2026]",
      "hover:!border-[#ff6b35]",
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
    dividerLine: "bg-[#222a32]",
    dividerText: "text-[#6b7785] text-xs uppercase tracking-wider",
    formFieldLabel: "text-[#f1f5f9] text-sm font-medium mb-1.5",
    formFieldInput: [
      "bg-[#101418]",
      "border border-[#222a32]",
      "text-[#f1f5f9]",
      "placeholder:text-[#6b7785]/60",
      "focus:border-[#ff6b35]",
      "focus:ring-2 focus:ring-[#ff6b35]/30",
      "focus:outline-none",
      "transition-colors",
    ].join(" "),
    formFieldInputShowPasswordButton: "text-[#6b7785] hover:text-[#f1f5f9]",
    formFieldHintText: "text-[#6b7785] text-xs",
    formFieldErrorText: "text-[#ff4d4d] text-xs",
    formFieldSuccessText: "text-[#22c55e] text-xs",
    formButtonPrimary: [
      "bg-[#ff6b35] hover:bg-[#ff8458] active:bg-[#c44a1f]",
      "text-[#08090a] font-semibold",
      "shadow-none",
      "border-0",
      "transition-colors",
      "uppercase tracking-wide text-sm",
    ].join(" "),
    formButtonReset:
      "text-[#6b7785] hover:text-[#f1f5f9] transition-colors",
    footer: "bg-transparent",
    footerAction: "text-[#6b7785]",
    footerActionText: "text-[#6b7785] text-sm",
    footerActionLink: [
      "text-[#ff6b35] hover:text-[#ff8458]",
      "font-medium",
      "transition-colors",
    ].join(" "),
    identityPreview:
      "bg-[#101418] border border-[#222a32] rounded-lg",
    identityPreviewText: "text-[#f1f5f9]",
    identityPreviewEditButton:
      "text-[#ff6b35] hover:text-[#ff8458] transition-colors",
    formResendCodeLink:
      "text-[#ff6b35] hover:text-[#ff8458] transition-colors",
    otpCodeFieldInput: [
      "bg-[#101418] border border-[#222a32]",
      "text-[#f1f5f9]",
      "focus:border-[#ff6b35] focus:ring-2 focus:ring-[#ff6b35]/30",
    ].join(" "),
    alert: "bg-[#1d242b] border border-[#222a32] text-[#f1f5f9]",
    alertText: "text-[#f1f5f9]",
    badge: "bg-[#101418] text-[#f1f5f9] border border-[#222a32]",
    avatarBox: "border border-[#222a32]",
    userButtonAvatarBox: "w-8 h-8 border border-[#222a32]",
    userButtonTrigger: [
      "rounded focus:outline-none",
      "focus:ring-2 focus:ring-[#ff6b35]/40",
    ].join(" "),
    userButtonPopoverCard: [
      "bg-[#0b0d0f]",
      "border border-[#222a32]",
      "shadow-2xl shadow-black/60",
    ].join(" "),
    userButtonPopoverActionButton:
      "text-[#f1f5f9] hover:bg-[#151a20] transition-colors",
    userButtonPopoverActionButtonText: "text-[#f1f5f9]",
    userButtonPopoverActionButtonIcon: "text-[#6b7785]",
    userButtonPopoverFooter: "bg-[#08090a] border-t border-[#222a32]",
  },
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    showOptionalFields: true,
    privacyPageUrl: "/privacy",
    termsPageUrl: "/terms",
  },
};

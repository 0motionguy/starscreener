// Clerk <SignIn /> / <SignUp /> appearance — matches trendingrepo's
// dark canvas + Liquid Lava accent. Wired through ClerkProvider in
// src/app/layout.tsx so every Clerk component (hosted pages + modal
// buttons) inherits the same look.
//
// Variables map to Clerk's high-level theme tokens; elements override
// individual sub-component class names where a token can't reach
// (card chrome, social buttons, inputs).

import type { Appearance } from "@clerk/types";

// Sourced from src/app/globals.css @theme block. Keep in sync if those
// design tokens move.
const TOKENS = {
  bgCanvas: "#08090a",
  bgShell: "#0b0d0f",
  bgRaised: "#101418",
  bgMuted: "#151a20",
  bgFill: "#1d242b",
  borderSubtle: "#1a2026",
  borderDefault: "#222a32",
  borderHover: "#4d5865",
  textDefault: "#eef0f2",
  textSubtle: "#84909b",
  textFaint: "#909caa",
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
    borderRadius: "0.5rem",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: "w-full max-w-md mx-auto",
    card: [
      "bg-[#0b0d0f]",
      "border border-[#222a32]",
      "shadow-2xl shadow-black/60",
      "rounded-xl",
      "backdrop-blur-sm",
    ].join(" "),
    cardBox: "bg-transparent",
    headerTitle:
      "text-[#eef0f2] text-2xl font-semibold tracking-tight font-[var(--font-space-grotesk)]",
    headerSubtitle: "text-[#84909b] text-sm",
    socialButtonsBlockButton: [
      "border border-[#222a32]",
      "bg-[#101418] hover:bg-[#151a20]",
      "text-[#eef0f2]",
      "transition-colors",
    ].join(" "),
    socialButtonsBlockButtonText: "text-[#eef0f2] font-medium",
    dividerLine: "bg-[#222a32]",
    dividerText: "text-[#84909b] text-xs uppercase tracking-wider",
    formFieldLabel: "text-[#eef0f2] text-sm font-medium mb-1.5",
    formFieldInput: [
      "bg-[#101418]",
      "border border-[#222a32]",
      "text-[#eef0f2]",
      "placeholder:text-[#84909b]/60",
      "focus:border-[#ff6b35]",
      "focus:ring-2 focus:ring-[#ff6b35]/30",
      "focus:outline-none",
      "transition-colors",
    ].join(" "),
    formFieldInputShowPasswordButton: "text-[#84909b] hover:text-[#eef0f2]",
    formFieldHintText: "text-[#84909b] text-xs",
    formFieldErrorText: "text-[#ff4d4d] text-xs",
    formFieldSuccessText: "text-[#22c55e] text-xs",
    formButtonPrimary: [
      "bg-[#ff6b35] hover:bg-[#ff8458] active:bg-[#c44a1f]",
      "text-white font-semibold",
      "shadow-lg shadow-[#ff6b35]/25",
      "border-0",
      "transition-all",
      "uppercase tracking-wide text-sm",
    ].join(" "),
    formButtonReset:
      "text-[#84909b] hover:text-[#eef0f2] transition-colors",
    footer: "bg-transparent",
    footerAction: "text-[#84909b]",
    footerActionText: "text-[#84909b] text-sm",
    footerActionLink: [
      "text-[#ff6b35] hover:text-[#ff8458]",
      "font-medium",
      "transition-colors",
    ].join(" "),
    identityPreview:
      "bg-[#101418] border border-[#222a32] rounded-lg",
    identityPreviewText: "text-[#eef0f2]",
    identityPreviewEditButton:
      "text-[#ff6b35] hover:text-[#ff8458] transition-colors",
    formResendCodeLink:
      "text-[#ff6b35] hover:text-[#ff8458] transition-colors",
    otpCodeFieldInput: [
      "bg-[#101418] border border-[#222a32]",
      "text-[#eef0f2]",
      "focus:border-[#ff6b35] focus:ring-2 focus:ring-[#ff6b35]/30",
    ].join(" "),
    alert: "bg-[#1d242b] border border-[#222a32] text-[#eef0f2]",
    alertText: "text-[#eef0f2]",
    badge: "bg-[#101418] text-[#eef0f2] border border-[#222a32]",
    avatarBox: "border border-[#222a32]",
    userButtonPopoverCard: [
      "bg-[#0b0d0f]",
      "border border-[#222a32]",
      "shadow-2xl shadow-black/60",
    ].join(" "),
    userButtonPopoverActionButton:
      "text-[#eef0f2] hover:bg-[#151a20] transition-colors",
    userButtonPopoverActionButtonText: "text-[#eef0f2]",
    userButtonPopoverActionButtonIcon: "text-[#84909b]",
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

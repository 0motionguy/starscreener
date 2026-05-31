"use client";

// Modal-first sign-in / sign-up trigger.
//
// Calls Clerk's browser-SDK modal opener (`window.Clerk.openSignIn`) when
// the SDK is loaded; falls back to a hard-link navigation to `/sign-in`
// (the hosted page) when Clerk is missing — e.g. when no Clerk key is
// set or the SDK failed to load. Returns `true` if the modal opened,
// `false` if it fell back.
//
// Safe to call from any client component without checking auth state
// first — the caller decides when to invoke this (e.g. after a session
// probe confirms anonymous).

declare global {
  interface Window {
    Clerk?: {
      openSignIn?: (props?: { redirectUrl?: string }) => void;
      openSignUp?: (props?: { redirectUrl?: string }) => void;
    };
  }
}

function currentHref(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

export function openSignInModal(redirectUrl?: string): boolean {
  if (typeof window === "undefined") return false;
  const target = redirectUrl ?? currentHref();
  const clerk = window.Clerk;
  if (clerk && typeof clerk.openSignIn === "function") {
    clerk.openSignIn({ redirectUrl: target });
    return true;
  }
  window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(target)}`);
  return false;
}

export function openSignUpModal(redirectUrl?: string): boolean {
  if (typeof window === "undefined") return false;
  const target = redirectUrl ?? currentHref();
  const clerk = window.Clerk;
  if (clerk && typeof clerk.openSignUp === "function") {
    clerk.openSignUp({ redirectUrl: target });
    return true;
  }
  window.location.assign(`/sign-up?redirect_url=${encodeURIComponent(target)}`);
  return false;
}

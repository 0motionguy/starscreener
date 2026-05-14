"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buildAuthHref } from "@/lib/auth/redirect-url";

interface HeaderAccountProps {
  publishableKey?: string;
}

function accountInitials(input: string): string {
  const cleaned = input.replace(/^user_/, "").trim();
  if (!cleaned) return "AC";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function currentBrowserPath(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function useAuthHref(): { href: string; refreshHref: () => string } {
  const pathname = usePathname() ?? "/";
  const [href, setHref] = useState(() => buildAuthHref("/sign-in", pathname));

  const refreshHref = useCallback(() => {
    const nextHref = buildAuthHref("/sign-in", currentBrowserPath(pathname));
    setHref(nextHref);
    return nextHref;
  }, [pathname]);

  useEffect(() => {
    refreshHref();
  }, [refreshHref]);

  return { href, refreshHref };
}

function SignedOutAccountLink() {
  const router = useRouter();
  const { href, refreshHref } = useAuthHref();
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        ) {
          refreshHref();
          return;
        }
        event.preventDefault();
        router.push(refreshHref());
      }}
      onFocus={refreshHref}
      onPointerEnter={refreshHref}
      className="btn-signup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
      title="Sign in or create an account"
      aria-label="Sign in or create an account"
    >
      <span>Account</span>
      <span className="arr" aria-hidden="true">-&gt;</span>
    </Link>
  );
}

function HeaderAccountLoaded() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <span
        className="btn-signup"
        aria-label="Loading account"
        aria-busy="true"
      >
        <span>Account</span>
      </span>
    );
  }

  if (!isSignedIn || !user) {
    return <SignedOutAccountLink />;
  }

  const label =
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    user.id;

  return (
    <Link
      href="/you"
      className="profile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:rounded"
      title="Your account"
      aria-label="Your account"
    >
      <div className="av">{accountInitials(label)}</div>
    </Link>
  );
}

export function HeaderAccount({ publishableKey }: HeaderAccountProps) {
  if (!publishableKey) {
    return <SignedOutAccountLink />;
  }

  return <HeaderAccountLoaded />;
}

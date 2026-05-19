"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";

interface HeaderAccountLoadedProps {
  fallback: ReactNode;
  getInitials: (input: string) => string;
}

export function HeaderAccountLoaded({
  fallback,
  getInitials,
}: HeaderAccountLoadedProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <HeaderAccountLoading />;
  }

  return (
    <HeaderAccountClerkState fallback={fallback} getInitials={getInitials} />
  );
}

function HeaderAccountLoading() {
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

function HeaderAccountClerkState({
  fallback,
  getInitials,
}: HeaderAccountLoadedProps) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return <HeaderAccountLoading />;
  }

  if (!isSignedIn || !user) {
    return fallback;
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
      <div className="av">{getInitials(label)}</div>
    </Link>
  );
}

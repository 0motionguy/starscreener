"use client";

// Generic React error boundary for client components.
//
// Used to wrap heavy canvas / chart mounts (BubbleMap, SubredditMindshare,
// RepoDetailChart) so a throw inside a requestAnimationFrame physics step
// or a Recharts render error doesn't crash the whole page tree. Audit
// finding UI-07: zero ErrorBoundary instances anywhere in src/components/
// before this — a malformed seed or transient render bug would unmount
// the entire ancestor branch and leave the user staring at a blank page.
//
// Behaviour:
//   - Catches errors thrown during render of children.
//   - Shows the `fallback` prop if provided, otherwise a minimal stub.
//   - Logs the error to console + Sentry-equivalent via the `onError` prop.
//   - Resets when the `resetKey` prop changes (route change, tab switch).
//
// React error boundaries MUST be class components — there's still no
// function-component equivalent in React 19. Keep this terse.

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Element to render when an error is caught. Default: a tiny inline stub.
   * Pass a function to receive `(error, reset)` and render a richer state.
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /**
   * Called once per caught error. Wire to Sentry/PostHog/console as needed.
   * Default just `console.error`s.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * If this prop changes between renders, the boundary resets. Useful when
   * you want a route change or seed-set swap to clear a stuck error state.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      this.props.resetKey !== prev.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, info);
    } else {
      console.error("[ErrorBoundary] caught:", error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    if (typeof this.props.fallback === "function") {
      return this.props.fallback(this.state.error, this.reset);
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center text-xs text-zinc-500">
        Couldn’t render this view.{" "}
        <button
          type="button"
          onClick={this.reset}
          className="ml-2 underline underline-offset-2 hover:text-zinc-300"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <p
        className={cn(
          "font-mono font-bold text-8xl md:text-9xl",
          "text-text-muted select-none"
        )}
      >
        404
      </p>

      <h1 className="mt-4 text-xl md:text-2xl font-semibold text-text-primary">
        Page not found
      </h1>

      <p className="mt-2 text-sm text-text-tertiary text-center max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>

      <Link
        href={ROUTES.HOME}
        className={cn(
          "mt-8 inline-flex items-center gap-2",
          "px-5 py-2.5 rounded-button",
          "bg-accent-green text-bg-primary",
          "font-medium text-sm",
          "hover:opacity-90 transition-opacity"
        )}
      >
        Back to Home
      </Link>
    </div>
  );
}

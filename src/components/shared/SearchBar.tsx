"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

interface SearchBarProps {
  placeholder?: string;
  fullWidth?: boolean;
  onSearch?: (query: string) => void;
  autoFocus?: boolean;
}

export function SearchBar({
  placeholder = "Search repos...",
  fullWidth = false,
  onSearch,
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState("");

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setValue(q);

      if (onSearch) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          onSearch(q);
        }, 300);
      }
    },
    [onSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const q = value.trim();
        if (q) {
          router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(q)}`);
        }
      }
    },
    [value, router]
  );

  const handleClear = useCallback(() => {
    setValue("");
    onSearch?.("");
    inputRef.current?.focus();
  }, [onSearch]);

  return (
    <div className={cn("relative", fullWidth ? "w-full" : "w-64")}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full h-9 pl-9 pr-8",
          "bg-bg-secondary border border-border-primary rounded-card",
          "text-sm font-mono text-text-primary placeholder:text-text-muted",
          "outline-none",
          "focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20",
          "transition-colors"
        )}
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

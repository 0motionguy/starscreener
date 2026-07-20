"use client";

// MobileAppProvider — the single client controller for the mobile app shell.
//
// Owns: which full-screen sheet is open (search | ask | filters | more, one
// at a time), body-scroll lock while a sheet is open, focus restoration to
// the control that opened the sheet, and the `mapp-on` root class.
//
// The `mapp-on` class is added on mount (client) and removed on unmount, so
// if the JS never runs the class is absent and the desktop/hamburger chrome
// is untouched — graceful degradation, zero SSR/desktop regression.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type MobileSheetId = "search" | "ask" | "filters" | "more";

interface MobileAppState {
  activeSheet: MobileSheetId | null;
  openSheet: (id: MobileSheetId) => void;
  closeSheet: () => void;
  toggleSheet: (id: MobileSheetId) => void;
}

const MobileAppContext = createContext<MobileAppState | null>(null);

export function useMobileApp(): MobileAppState {
  const value = useContext(MobileAppContext);
  if (!value) {
    throw new Error("useMobileApp must be used within <MobileAppProvider>");
  }
  return value;
}

export function MobileAppProvider({ children }: { children: React.ReactNode }) {
  const [activeSheet, setActiveSheet] = useState<MobileSheetId | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const openSheet = useCallback((id: MobileSheetId) => {
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    setActiveSheet(id);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
    const el = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (el && typeof el.focus === "function") {
      // Restore focus on the next frame so the element is interactive again.
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  const toggleSheet = useCallback(
    (id: MobileSheetId) => {
      if (activeSheet === id) {
        closeSheet();
      } else {
        openSheet(id);
      }
    },
    [activeSheet, openSheet, closeSheet],
  );

  // Root marker class — presence signals the mobile app shell is live.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mapp-on");
    return () => root.classList.remove("mapp-on");
  }, []);

  // Body scroll lock while any sheet is open. Restores the prior value so we
  // never clobber a lock set elsewhere.
  useEffect(() => {
    if (!activeSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activeSheet]);

  return (
    <MobileAppContext.Provider
      value={{ activeSheet, openSheet, closeSheet, toggleSheet }}
    >
      {children}
    </MobileAppContext.Provider>
  );
}

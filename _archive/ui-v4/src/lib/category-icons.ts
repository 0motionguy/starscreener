// StarScreener — Shared Lucide icon map for CATEGORIES[i].icon string values.
//
// The constants in `src/lib/constants.ts` reference Lucide icons by their
// exported name as a string. This module centralizes the lookup so each page
// doesn't have to duplicate the same import block.

import {
  Brain,
  Globe,
  Wrench,
  Server,
  Database,
  Shield,
  Smartphone,
  BarChart3,
  Coins,
  Cog,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  Globe,
  Wrench,
  Server,
  Database,
  Shield,
  Smartphone,
  BarChart3,
  Coins,
  Cog,
};

export function getCategoryIcon(name: string): LucideIcon | null {
  return CATEGORY_ICON_MAP[name] ?? null;
}

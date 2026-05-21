"use client";

import { StarIcon } from "@/components/icons-animated";

interface TrendingStarProps {
  className?: string;
  size?: number;
}

export function TrendingStar({ className = "star-icon", size = 14 }: TrendingStarProps) {
  return <StarIcon className={className} size={size} color="currentColor" />;
}

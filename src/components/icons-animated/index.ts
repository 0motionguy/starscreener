// Animated icon barrel — itshover icons (Apache 2.0).
// Each icon is a framer-motion component that animates on hover via
// motion.svg's onHoverStart/onHoverEnd. forwardRef exposes
// startAnimation()/stopAnimation() for programmatic triggers.
//
// Usage:
//   import { RocketIcon, MagnifierIcon } from "@/components/icons-animated";
//   <RocketIcon size={20} color="var(--accent)" />
//
// All icons accept { size, color, strokeWidth, className } plus any
// motion.svg-compatible prop. See ./types for the exported interface.

export type { AnimatedIconProps, AnimatedIconHandle, IconEasing } from "./types";

export { default as MessageCircleIcon } from "./message-circle-icon";
export { default as MagnifierIcon } from "./magnifier-icon";
export { default as GithubIcon } from "./github-icon";
export { default as RocketIcon } from "./rocket-icon";
export { default as EyeIcon } from "./eye-icon";
export { default as StarIcon } from "./star-icon";
export { default as HeartIcon } from "./heart-icon";
export { default as FilledBellIcon } from "./filled-bell-icon";
export { default as UserIcon } from "./user-icon";
export { default as BookmarkIcon } from "./bookmark-icon";
export { default as UsersIcon } from "./users-icon";
export { default as CreditCard } from "./credit-card";
export { default as LockIcon } from "./lock-icon";
export { default as DownloadIcon } from "./download-icon";
export { default as GearIcon } from "./gear-icon";
export { default as ChartLineIcon } from "./chart-line-icon";
export { default as ChartBarIcon } from "./chart-bar-icon";
export { default as BulbSvg } from "./bulb-svg";
export { default as LayersIcon } from "./layers-icon";
export { default as RadioIcon } from "./radio-icon";
export { default as ClockIcon } from "./clock-icon";
export { default as CodeIcon } from "./code-icon";
export { default as CurrencyDollarIcon } from "./currency-dollar-icon";
export { default as FileDescriptionIcon } from "./file-description-icon";
export { default as FlameIcon } from "./flame-icon";
export { default as SparklesIcon } from "./sparkles-icon";
export { default as TargetIcon } from "./target-icon";
export { default as TrophyIcon } from "./trophy-icon";
export { default as ShieldCheck } from "./shield-check";
export { default as TwitterXIcon } from "./twitter-x-icon";
export { default as DiscordIcon } from "./discord-icon";
export { default as ExternalLinkIcon } from "./external-link-icon";
export { default as LinkIcon } from "./link-icon";
export { default as SaveIcon } from "./save-icon";
export { default as SendIcon } from "./send-icon";

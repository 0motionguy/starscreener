// Icon entry point.
//
// CANONICAL: use `<Icon name="trending-up" />` from "@/lib/icons" for every
// UI icon (132 SVGs in /public/icons/). Use `<SourceLogo source="github" />`
// for the 21 brand logos.
//
// The lucide-react re-exports below are kept temporarily for back-compat
// with existing callsites — they're @deprecated. Migrate to `<Icon name="…" />`
// surface-by-surface per docs/DESIGN-SYSTEM.md §14.

export { Icon, SourceLogo } from "@/components/icon/Icon";
export type { IconName, IconSize, IconProps, SourceName, SourceLogoProps } from "@/components/icon/Icon";

/**
 * @deprecated Use `<Icon name="…" />` from "@/lib/icons" instead.
 * The lucide-react re-exports stay alive until every callsite migrates.
 */
export {
  // Trending row actions + table
  Star,
  Heart,
  Bell,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  // Ideas / reactions
  Flame,
  Lightbulb,
  Rocket,
  Target,
  CircleCheck,
  CircleDollarSign,
  Zap,
  Sparkles,
  // Activity feed event kinds
  MessageSquare,
  Tag,
  FileText,
  GitCommit,
  GitPullRequest,
  Package,
  MessagesSquare,
  TrendingUp,
  // Topbar / sidebar nav
  Menu,
  BarChart3,
  Activity,
  // Account subnav
  User,
  Bookmark,
  Users,
  CreditCard,
  KeyRound,
  Download,
  Settings,
  // Tools value strip
  Clock,
  Code,
  // Repo value strip
  Layers,
  Radio,
  // Ideas contribution composer
  Search,
  Wrench,
  Eye,
  Hammer,
  // Misc shared
  X,
} from "lucide-react";

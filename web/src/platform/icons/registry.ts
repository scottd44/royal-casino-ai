/* ============================================================
   The icon registry — one map, static imports only.

   PHASE_1_MOTION_ICONS_PLAN.md §11 / DEVELOPMENT_GUIDE.md §2 / HANDOFF §6.8:

     Guessing a Lucide name shipped a SWIMMER where a snake belonged and a
     COFFEE MUG where a rock belonged (Lucide has neither `snake` nor
     `rock`). The fix is not "look harder" — it's to make the lookup a
     compile-time operation. `<Icon name="snek" />` must fail `tsc`, not
     render silently as nothing (or worse, as a near-miss).

   That is the ENTIRE reason every import below is a static named import
   from 'lucide-react' rather than a dynamic string -> component lookup:

     - No index signature on ICONS. Every key is a literal, checked against
       its value at the object-literal call site.
     - No `React.lazy(() => import(...))`, no runtime `require(name)`.
     - `IconName` is derived FROM the object (`keyof typeof ICONS`), not
       hand-maintained alongside it, so the two can't drift.

   This module is also the ONLY place in the app allowed to import
   'lucide-react' directly — every call site goes through `<Icon name=... />`
   in Icon.tsx instead. That's what makes "every icon in the chrome" an
   auditable, enforceable claim rather than a convention someone can forget.

   Full source list this was ported from: every `icon("...")` call in
   js/core.js + js/app.js + every `data-lucide="..."` in index.html/js/*,
   i.e. `grep -orhE 'icon\("[a-zA-Z0-9:_-]+"' js/` unioned with
   `grep -orhE 'data-lucide="[a-zA-Z0-9:_-]+"' js/ index.html`, plus
   `panel-left` for the React shell's collapse control (the legacy app used
   the raw `chevrons-left` / `menu` pair for that job instead — both are
   still carried below so nothing is lost, but the new AppShell.tsx uses
   PanelLeft, so it's included too).

   RENAMES (Lucide v0.469 legacy name -> current lucide-react v1.27 export):
     - `wand-2` -> the icon file itself was renamed to `wand-sparkles`
       upstream. `Wand2` is STILL exported as a back-compat alias of
       `WandSparkles`, but we import the canonical `WandSparkles` name here
       per the "use the current name" instruction, and keep the legacy
       string `'wand-2'` as the ICONS key so nothing else in the app needs
       to change vocabulary.
     - Everything else resolved under its legacy name unchanged (notably
       `circle-help`, which some Lucide versions ship as `help-circle` —
       v1.27 exports both as aliases of the same `circle-question-mark`
       icon, so the legacy name needed no change).
   ============================================================ */

import {
  ArrowRight,
  ArrowUpDown,
  Banknote,
  Bird,
  Bomb,
  BookOpen,
  Bot,
  Brain,
  ChartLine,
  Cherry,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  Club,
  Coffee,
  Cpu,
  Crosshair,
  Crown,
  Diamond,
  Dices,
  Disc3,
  Download,
  Flame,
  Gamepad2,
  Gauge,
  Gem,
  GitFork,
  Hammer,
  Hash,
  Headset,
  Heart,
  Info,
  Layers,
  Layers2,
  Menu,
  MessageCircle,
  Monitor,
  PanelLeft,
  Play,
  Rabbit,
  RefreshCw,
  Rocket,
  RotateCcw,
  Settings2,
  Ship,
  Shuffle,
  Smartphone,
  Snowflake,
  Spade,
  Square,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Undo2,
  Volume2,
  Wallet,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'

import { RcSnake, RcRock, RcPaper, RcScissors } from './raw'

/**
 * name -> component. `as const` so `keyof typeof ICONS` is a union of the
 * exact literal keys, not `string`.
 */
export const ICONS = {
  'arrow-right': ArrowRight,
  'arrow-up-down': ArrowUpDown,
  banknote: Banknote,
  bird: Bird,
  bomb: Bomb,
  'book-open': BookOpen,
  bot: Bot,
  brain: Brain,
  'chart-line': ChartLine,
  cherry: Cherry,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevrons-left': ChevronsLeft,
  'circle-dollar-sign': CircleDollarSign,
  'circle-dot': CircleDot,
  'circle-help': CircleHelp,
  club: Club,
  coffee: Coffee,
  cpu: Cpu,
  crosshair: Crosshair,
  crown: Crown,
  diamond: Diamond,
  dices: Dices,
  'disc-3': Disc3,
  download: Download,
  flame: Flame,
  'gamepad-2': Gamepad2,
  gauge: Gauge,
  gem: Gem,
  'git-fork': GitFork,
  hammer: Hammer,
  hash: Hash,
  headset: Headset,
  heart: Heart,
  info: Info,
  layers: Layers,
  'layers-2': Layers2,
  menu: Menu,
  'message-circle': MessageCircle,
  monitor: Monitor,
  'panel-left': PanelLeft,
  play: Play,
  rabbit: Rabbit,
  'refresh-cw': RefreshCw,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  'settings-2': Settings2,
  ship: Ship,
  shuffle: Shuffle,
  smartphone: Smartphone,
  snowflake: Snowflake,
  spade: Spade,
  square: Square,
  swords: Swords,
  target: Target,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  trophy: Trophy,
  'undo-2': Undo2,
  'volume-2': Volume2,
  wallet: Wallet,
  'wand-2': WandSparkles,
  x: X,
  zap: Zap,

  // rc: namespace — marks Lucide does not carry at all. See raw/*.tsx.
  'rc:snake': RcSnake,
  'rc:rock': RcRock,
  'rc:paper': RcPaper,
  'rc:scissors': RcScissors,
} as const

/** Every valid `<Icon name>` value. A typo here is a TypeScript error. */
export type IconName = keyof typeof ICONS

/**
 * Re-exported so `raw/*.tsx` can type their props identically to a real
 * Lucide component (`size`, `className`, `strokeWidth`, `color`, …)
 * without importing 'lucide-react' themselves — this file stays the only
 * module in the app with a runtime or type dependency on that package.
 */
export type { LucideProps } from 'lucide-react'

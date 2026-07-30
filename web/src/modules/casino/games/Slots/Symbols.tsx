/* ============================================================
   Slots symbol art — hand-drawn SVG shapes, no emoji/font glyph dependency.

   Legacy (js/games/slots.js) draws each symbol as a pure CSS shape via
   `.sym-<s>` classes that never shipped into this repo's React build (they
   live in a stylesheet this port doesn't have access to). This file is the
   from-scratch equivalent: one small SVG per symbol, two flat colors each
   (a base fill + an accent for shine/depth), matching the spec's per-symbol
   palette — seven=red/gold, diamond=cyan/blue, bell=gold, clover=green,
   star=gold, crown=gold/purple, cherry=red/green-leaf.

   `SYMBOLS` itself is the real payout table, copied verbatim from
   slots.js:11-19 (rarer symbol -> lower `weight`, higher payout). Ordering
   is load-bearing: SlotsGame.tsx's `weighted` pool is built by walking this
   array in order, and the paytable renders in this order too.
   ============================================================ */

export type SlotSymbolKey = 'seven' | 'diamond' | 'bell' | 'clover' | 'star' | 'crown' | 'cherry'

export type SlotSymbol = {
  s: SlotSymbolKey
  name: string
  weight: number
  three: number
  two: number
  base: string
  accent: string
}

export const SYMBOLS: SlotSymbol[] = [
  { s: 'seven', name: 'Seven', weight: 1, three: 60, two: 6, base: '#ef4d6a', accent: '#f6d97a' },
  { s: 'diamond', name: 'Diamond', weight: 2, three: 38, two: 5, base: '#22d3ee', accent: '#4d8cff' },
  { s: 'bell', name: 'Bell', weight: 3, three: 18, two: 4, base: '#e6c15a', accent: '#8a6a1a' },
  { s: 'clover', name: 'Clover', weight: 4, three: 10, two: 3, base: '#22e59a', accent: '#0f7a52' },
  { s: 'star', name: 'Star', weight: 5, three: 7, two: 2, base: '#f6d97a', accent: '#e6a83a' },
  { s: 'crown', name: 'Crown', weight: 6, three: 5, two: 1, base: '#e6c15a', accent: '#a97bff' },
  { s: 'cherry', name: 'Cherry', weight: 8, three: 4, two: 1, base: '#ef4d6a', accent: '#3ecf8e' },
]

export const SYMBOL_BY_KEY: Record<SlotSymbolKey, SlotSymbol> = Object.fromEntries(
  SYMBOLS.map((sym) => [sym.s, sym]),
) as Record<SlotSymbolKey, SlotSymbol>

function Shape({ sym }: { sym: SlotSymbol }) {
  const { base, accent } = sym
  switch (sym.s) {
    case 'seven':
      return (
        <g>
          <rect x="20" y="13" width="60" height="17" rx="3" fill={base} />
          <rect x="45" y="13" width="17" height="80" rx="3" fill={base} transform="rotate(21 53.5 53)" />
          <rect x="20" y="13" width="60" height="6" rx="3" fill={accent} opacity="0.85" />
        </g>
      )
    case 'diamond':
      return (
        <g>
          <polygon points="50,8 82,40 50,92 18,40" fill={base} />
          <polygon points="50,8 66,40 50,58 34,40" fill={accent} opacity="0.55" />
          <line x1="18" y1="40" x2="82" y2="40" stroke={accent} strokeWidth="2" opacity="0.7" />
        </g>
      )
    case 'bell':
      return (
        <g>
          <path
            d="M50 16 C34 16 30 36 28 50 C27 61 22 68 16 73 H84 C78 68 73 61 72 50 C70 36 66 16 50 16 Z"
            fill={base}
          />
          <rect x="41" y="6" width="18" height="11" rx="4" fill={accent} />
          <circle cx="50" cy="83" r="8" fill={accent} />
          <path d="M35 45 C36 34 41 26 48 22" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
        </g>
      )
    case 'clover':
      return (
        <g>
          <circle cx="37" cy="37" r="19" fill={base} />
          <circle cx="63" cy="37" r="19" fill={base} />
          <circle cx="37" cy="63" r="19" fill={base} />
          <circle cx="63" cy="63" r="19" fill={base} />
          <circle cx="50" cy="50" r="10" fill={accent} opacity="0.5" />
          <rect x="46" y="62" width="8" height="30" rx="4" fill={accent} />
        </g>
      )
    case 'star':
      return (
        <g>
          <polygon
            points="50,6 61,36 93,36 67,55 77,89 50,69 23,89 33,55 7,36 39,36"
            fill={base}
          />
          <polygon points="50,6 56,32 44,32" fill={accent} opacity="0.7" />
        </g>
      )
    case 'crown':
      return (
        <g>
          <path d="M13 78 L23 34 L40 56 L50 22 L60 56 L77 34 L87 78 Z" fill={base} />
          <rect x="13" y="78" width="74" height="11" rx="2" fill={base} />
          <circle cx="23" cy="32" r="6" fill={accent} />
          <circle cx="50" cy="20" r="6" fill={accent} />
          <circle cx="77" cy="32" r="6" fill={accent} />
        </g>
      )
    case 'cherry':
      return (
        <g>
          <path d="M38 52 C43 28 56 17 62 10" stroke={base} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M64 54 C61 33 60 22 62 10" stroke={base} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M58 12 C68 5 82 9 84 20 C73 23 62 18 58 12 Z" fill={accent} />
          <circle cx="35" cy="70" r="17" fill={base} />
          <circle cx="65" cy="73" r="17" fill={base} />
          <ellipse cx="30" cy="64" rx="5" ry="3" fill="#ffffff" opacity="0.35" />
          <ellipse cx="60" cy="67" rx="5" ry="3" fill="#ffffff" opacity="0.35" />
        </g>
      )
    default:
      return null
  }
}

/** Renders one symbol's SVG art. `glow` adds a colored drop-shadow matching
 *  the symbol's own palette — used for winning-payline emphasis. Pure
 *  presentation, no contract id, safe to mount dozens of at once (reel
 *  filler strips + the paytable all render this). */
export function SymbolArt({
  sym,
  size = 56,
  glow = false,
  title,
}: {
  sym: SlotSymbolKey
  size?: number
  glow?: boolean
  title?: string
}) {
  const def = SYMBOL_BY_KEY[sym]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="sym"
      role="img"
      aria-label={title ?? def.name}
      style={{
        filter: glow
          ? `drop-shadow(0 0 10px ${def.accent}) drop-shadow(0 0 18px ${def.base})`
          : 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
        transition: 'filter 0.25s var(--ease)',
      }}
    >
      <Shape sym={def} />
    </svg>
  )
}

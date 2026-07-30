/* ============================================================
   Cosmic Gems symbol art — hand-drawn SVG gem facets, no emoji/CSS-shape
   dependency (same discipline as Slots/Symbols.tsx).

   Legacy (js/games/gems.js) draws each gem as a pure-CSS `.gem-<s>` facet
   that never shipped into this repo's stylesheet. This file is the
   from-scratch equivalent: one small faceted-gem SVG per symbol, deliberately
   SIX DIFFERENT CUT SHAPES (not six recolors of the same polygon) so the
   grid reads as a real gem case rather than a palette swap of Slots' art:
     diamond  — round brilliant-cut (facet spokes off a center table)
     star     — a star-cut gem (faceted 5-point silhouette)
     orb      — a round cabochon (polished dome, no hard facets)
     amethyst — a crystal cluster (raw pointed prisms, unlike a cut stone)
     sapphire — an oval cabochon (soft ellipse, contrasts amethyst's points)
     emerald  — a classic emerald (step) cut octagon

   `SYMBOLS` is the real payout table, copied verbatim from gems.js:14-21
   (`w` = pool weight, `pay` = per-line multiplier on a bet/5 line stake).
   Ordering is load-bearing: GemsGame.tsx's weighted pool is built by
   walking this array in order, and the paytable renders in this order.
   ============================================================ */

export type GemSymbolKey = 'diamond' | 'star' | 'orb' | 'amethyst' | 'sapphire' | 'emerald'

export type GemSymbol = {
  s: GemSymbolKey
  name: string
  w: number
  pay: number
  base: string
  accent: string
  glint: string
}

export const SYMBOLS: GemSymbol[] = [
  { s: 'diamond', name: 'Diamond', w: 2, pay: 240, base: '#bdf3ff', accent: '#5fd4ff', glint: '#ffffff' },
  { s: 'star', name: 'Star', w: 3, pay: 117, base: '#f6d97a', accent: '#e6a83a', glint: '#fff3c4' },
  { s: 'orb', name: 'Orb', w: 4, pay: 62, base: '#ff8fd6', accent: '#c94fd9', glint: '#ffe1f6' },
  { s: 'amethyst', name: 'Amethyst', w: 6, pay: 30, base: '#c79bff', accent: '#7b3fe0', glint: '#f0e3ff' },
  { s: 'sapphire', name: 'Sapphire', w: 8, pay: 18, base: '#6fa8ff', accent: '#2f5fd6', glint: '#dcebff' },
  { s: 'emerald', name: 'Emerald', w: 11, pay: 10.7, base: '#57e6a8', accent: '#159a68', glint: '#d6ffef' },
]

export const SYMBOL_BY_KEY: Record<GemSymbolKey, GemSymbol> = Object.fromEntries(
  SYMBOLS.map((sym) => [sym.s, sym]),
) as Record<GemSymbolKey, GemSymbol>

function Facets({ sym }: { sym: GemSymbol }) {
  const { base, accent, glint } = sym
  switch (sym.s) {
    case 'diamond':
      // Round brilliant: octagon outline, a small center table, and facet
      // spokes running out to the girdle — the classic "cut" look.
      return (
        <g>
          <polygon points="50,10 74,20 90,44 82,72 50,92 18,72 10,44 26,20" fill={base} />
          <polygon points="50,32 62,40 58,58 42,58 38,40" fill={accent} opacity="0.75" />
          {[
            [50, 10, 50, 32],
            [74, 20, 62, 40],
            [90, 44, 58, 45],
            [82, 72, 58, 58],
            [50, 92, 50, 58],
            [18, 72, 42, 58],
            [10, 44, 42, 45],
            [26, 20, 38, 40],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth="1.4" opacity="0.6" />
          ))}
          <circle cx="46" cy="30" r="5" fill={glint} opacity="0.85" />
        </g>
      )
    case 'star':
      return (
        <g>
          <polygon points="50,6 61,36 93,36 67,55 77,89 50,69 23,89 33,55 7,36 39,36" fill={base} />
          {[
            [50, 6, 50, 50],
            [93, 36, 50, 50],
            [77, 89, 50, 50],
            [23, 89, 50, 50],
            [7, 36, 50, 50],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth="1.6" opacity="0.55" />
          ))}
          <polygon points="50,26 57,44 43,44" fill={glint} opacity="0.8" />
        </g>
      )
    case 'orb':
      // A polished cabochon dome — soft round body, no hard facet lines,
      // just a broad highlight to read as "glossy" rather than "cut".
      return (
        <g>
          <circle cx="50" cy="52" r="38" fill={base} />
          <circle cx="50" cy="52" r="38" fill="none" stroke={accent} strokeWidth="3" opacity="0.5" />
          <ellipse cx="38" cy="36" rx="14" ry="9" fill={glint} opacity="0.75" transform="rotate(-30 38 36)" />
          <ellipse cx="50" cy="52" rx="24" ry="20" fill={accent} opacity="0.18" />
        </g>
      )
    case 'amethyst':
      // A raw crystal cluster — three pointed prisms of varying height,
      // unlike any of the other polished/faceted cuts in this set.
      return (
        <g>
          <polygon points="30,90 22,46 34,20 42,46 38,90" fill={accent} opacity="0.85" />
          <polygon points="55,90 46,32 58,8 68,32 64,90" fill={base} />
          <polygon points="78,90 72,50 80,28 88,50 84,90" fill={accent} opacity="0.85" />
          <line x1="58" y1="8" x2="58" y2="90" stroke={glint} strokeWidth="2" opacity="0.5" />
          <polygon points="46,32 58,8 68,32" fill={glint} opacity="0.45" />
        </g>
      )
    case 'sapphire':
      // A soft oval cabochon — contrasts amethyst's hard points.
      return (
        <g>
          <ellipse cx="50" cy="52" rx="34" ry="42" fill={base} />
          <ellipse cx="50" cy="52" rx="34" ry="42" fill="none" stroke={accent} strokeWidth="3" opacity="0.6" />
          <ellipse cx="50" cy="30" rx="18" ry="10" fill={accent} opacity="0.4" />
          <ellipse cx="40" cy="34" rx="10" ry="6" fill={glint} opacity="0.8" transform="rotate(-20 40 34)" />
        </g>
      )
    case 'emerald':
      // A classic emerald (step) cut — octagon with concentric step facets.
      return (
        <g>
          <polygon points="34,10 66,10 90,32 90,72 66,94 34,94 10,72 10,32" fill={base} />
          <polygon points="40,20 60,20 78,36 78,68 60,84 40,84 22,68 22,36" fill="none" stroke={accent} strokeWidth="2.4" opacity="0.7" />
          <polygon points="46,32 54,32 64,40 64,64 54,72 46,72 36,64 36,40" fill={accent} opacity="0.35" />
          <line x1="34" y1="10" x2="46" y2="32" stroke={accent} strokeWidth="1.2" opacity="0.5" />
          <line x1="66" y1="10" x2="54" y2="32" stroke={accent} strokeWidth="1.2" opacity="0.5" />
          <ellipse cx="42" cy="26" rx="7" ry="4" fill={glint} opacity="0.7" />
        </g>
      )
    default:
      return null
  }
}

/** A dim, un-cut placeholder facet shown before the first spin — legacy's
 *  `.gem-blank`. Purely decorative, never carries a symbol identity. */
function BlankFacet() {
  return (
    <g>
      <polygon
        points="50,10 74,20 90,44 82,72 50,92 18,72 10,44 26,20"
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="2"
        strokeDasharray="4 5"
      />
    </g>
  )
}

/** Renders one gem's SVG art, or the blank placeholder when `sym` is null.
 *  `glow` adds a colored drop-shadow matching the symbol's own palette —
 *  used for a winning-payline cell. Pure presentation, no contract id. */
export function GemArt({
  sym,
  size = 56,
  glow = false,
  title,
}: {
  sym: GemSymbolKey | null
  size?: number
  glow?: boolean
  title?: string
}) {
  const def = sym ? SYMBOL_BY_KEY[sym] : null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="gem-svg"
      role="img"
      aria-label={title ?? def?.name ?? 'Empty'}
      style={{
        filter: def
          ? glow
            ? `drop-shadow(0 0 10px ${def.accent}) drop-shadow(0 0 20px ${def.base})`
            : 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))'
          : 'none',
        transition: 'filter 0.25s var(--ease)',
      }}
    >
      {def ? <Facets sym={def} /> : <BlankFacet />}
    </svg>
  )
}

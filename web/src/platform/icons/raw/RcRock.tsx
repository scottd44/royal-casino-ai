import { forwardRef } from 'react'
import type { LucideProps } from '../registry'

/**
 * rc:rock — hand-drawn, ported verbatim from `RAW_SVG['rc:rock']` in
 * js/core.js:175-178. Used for the Rock-Paper-Scissors game's `rock` throw
 * and its lobby-card / sidebar mark.
 *
 * WHY THIS EXISTS (DEVELOPMENT_GUIDE.md §2): Lucide has no "rock" mark.
 * Guessing a rounded-blob path for one reads as a coffee mug — that shipped
 * once too. The legacy fix was a heavy faceted stone: an octagon outline
 * with two interior facet lines so it reads as mass rather than a circle.
 * Ported here unchanged, with the Lucide-compatible prop contract so it can
 * sit in the same `ICONS` map as a real Lucide component.
 *
 * Note this mark omits `stroke-linecap` in the original (only
 * `stroke-linejoin="round"`) — preserved here; the facet lines are meant to
 * meet at sharp corners, not rounded ends.
 */
const RcRock = forwardRef<SVGSVGElement, LucideProps>(function RcRock(
  { color = 'currentColor', size = 24, strokeWidth = 2, absoluteStrokeWidth, className, ...rest },
  ref,
) {
  const computedStrokeWidth = absoluteStrokeWidth
    ? (Number(strokeWidth) * 24) / Number(size)
    : strokeWidth

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={computedStrokeWidth}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 3h8l5 6-9 12L3 9z" />
      <path d="M8 3 7 9l5 12M16 3l1 6-5 12M3 9h18" />
    </svg>
  )
})

export default RcRock

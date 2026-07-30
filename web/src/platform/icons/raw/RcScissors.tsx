import { forwardRef } from 'react'
import type { LucideProps } from '../registry'

/**
 * rc:scissors — hand-drawn, ported verbatim from `RAW_SVG['rc:scissors']`
 * in js/core.js:182-185. Used for the Rock-Paper-Scissors game's `scissors`
 * throw.
 *
 * Lucide *does* ship a `scissors` icon, but it draws closed shears — wrong
 * silhouette for an open "V" throw gesture matching this game's rock/paper
 * marks. Rather than let one throw look stylistically foreign next to the
 * other two hand-drawn marks, all three throws are drawn together here so
 * the trio stays visually consistent. Same path data as core.js, unchanged.
 *
 * Matches the original's attribute set: `stroke-linecap="round"` +
 * `stroke-linejoin="round"`, same as rc:snake.
 */
const RcScissors = forwardRef<SVGSVGElement, LucideProps>(function RcScissors(
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
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="18" r="2.6" />
      <path d="M7.8 16.2 18 3M16.2 16.2 6 3" />
    </svg>
  )
})

export default RcScissors

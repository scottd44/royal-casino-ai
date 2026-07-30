import { forwardRef } from 'react'
import type { LucideProps } from '../registry'

/**
 * rc:snake — hand-drawn, ported verbatim from `RAW_SVG['rc:snake']` in
 * js/core.js:171-174.
 *
 * WHY THIS EXISTS (DEVELOPMENT_GUIDE.md §2, "Icons — no emoji in the
 * chrome"): Lucide has no snake mark at all. The nearest-sounding name,
 * `waves`, renders a swimmer — that near-miss actually shipped once. Rather
 * than guess again, the legacy app drew this coiling-body-plus-eye path by
 * hand and namespaced it `rc:` so it flows through the same `icon()` call
 * sites as every Lucide name. This component is that same path data,
 * unchanged, wearing a Lucide-compatible prop contract so the registry can
 * hold both kinds of icon behind one `IconName` union.
 *
 * Same stroke contract as core.js: fill="none", stroke="currentColor",
 * stroke-width 2, round caps/joins, viewBox 0 0 24 24, aria-hidden — plus
 * `size` / `className` / `strokeWidth` / `color` so it drops into `<Icon>`
 * exactly like a Lucide component would (see Icon.tsx's `absoluteStrokeWidth`
 * scaling, mirrored here from lucide-react's own `Icon.mjs`).
 */
const RcSnake = forwardRef<SVGSVGElement, LucideProps>(function RcSnake(
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
      <path d="M3 18c3.4 0 3.4-4.5 6.8-4.5S13.2 18 16.6 18 20 13.5 20 11.5 18.4 8 16.6 8h-4" />
      <path d="M12.6 8a3 3 0 1 1 3-3" />
      <circle cx="15.6" cy="4.4" r=".9" fill="currentColor" />
    </svg>
  )
})

export default RcSnake

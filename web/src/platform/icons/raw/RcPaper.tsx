import { forwardRef } from 'react'
import type { LucideProps } from '../registry'

/**
 * rc:paper — hand-drawn, ported verbatim from `RAW_SVG['rc:paper']` in
 * js/core.js:179-181. Used for the Rock-Paper-Scissors game's `paper` throw.
 *
 * Lucide's `file` / `file-text` marks read as a document, not a flat sheet
 * held up as a hand throw — close enough to be a near-miss, which is exactly
 * what DEVELOPMENT_GUIDE.md §2 says to avoid. This is the same dog-eared
 * rectangle-with-lines path from core.js, unchanged, with the
 * Lucide-compatible prop contract.
 *
 * Matches the original's attribute set exactly: only `stroke-linejoin="round"`
 * is set (no `stroke-linecap`), so the folded corner keeps a crisp joint.
 */
const RcPaper = forwardRef<SVGSVGElement, LucideProps>(function RcPaper(
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
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  )
})

export default RcPaper

import type { SVGProps } from 'react'
import { ICONS } from './registry'
import type { IconName } from './registry'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** One of the statically-registered keys in `registry.ts`. */
  name: IconName
  /** Pixel size, applied to both width and height. */
  size?: number
  strokeWidth?: number
  /**
   * Optional accessible label. Passing this switches the icon from
   * `aria-hidden` decoration to a labelled, `role="img"` element — see
   * DEVELOPMENT_GUIDE.md §2: icons "behave like text" for the design
   * system, and text either has a name or is explicitly decorative, never
   * silently unlabelled.
   */
  title?: string
  className?: string
  color?: string
}

/**
 * `<Icon name="dices" />` — the ONLY way the rest of the app should render
 * an icon. PHASE_1_MOTION_ICONS_PLAN.md §11:
 *
 *   - Defaults `size=16`, `strokeWidth=2`, `absoluteStrokeWidth` so a larger
 *     `size` doesn't visually thin the stroke (Lucide scales the SVG
 *     viewBox uniformly; without `absoluteStrokeWidth` a 32px icon at
 *     strokeWidth 2 looks half as bold as a 16px one at the same value).
 *   - Keeps the legacy `.ico` class for stylesheet parity — css/styles.css
 *     has per-context sizing rules keyed off `.ico` (`.btn .ico`,
 *     `.sb-ico .ico`, `.ico-title`, …) that this class hook lets us reuse
 *     as-is rather than re-deriving in Tailwind.
 *   - Inherits `currentColor` by leaving `color` unset unless the caller
 *     passes one — "an icon must behave like text as far as the design
 *     system is concerned" (DEVELOPMENT_GUIDE.md §2).
 *   - `aria-hidden` by default. An optional `title` makes it a labelled,
 *     screen-reader-visible element instead (`role="img"` + `aria-label`),
 *     for the rare icon that IS the control's only label.
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  title,
  className,
  color,
  ...rest
}: IconProps) {
  const Component = ICONS[name]

  // `role="img"` + `aria-label` is sufficient for an accessible name and
  // works identically whether `Component` is a real Lucide icon (whose
  // internal `Icon.mjs` also accepts and renders a `<title>` child) or one
  // of our `raw/*.tsx` marks (which don't thread `children` through at
  // all) — using props rather than a child element keeps both kinds of
  // icon behaving the same way under `title`.
  const a11yProps = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const }

  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      color={color}
      className={['ico', className].filter(Boolean).join(' ')}
      {...a11yProps}
      {...rest}
    />
  )
}

export default Icon

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

/**
 * The legacy `.btn` button, reproduced verbatim (css/styles.css 540-586) as a
 * typed variant component. `agent-lab.js` and the legacy stylesheet key off
 * the literal `btn` / `btn-*` class names, so those are always emitted first,
 * ahead of any Tailwind utilities layered on by the caller.
 *
 * Interaction (hover sheen, press, disabled) is CSS-only — see M1 in the
 * handoff: framer-motion is reserved for entrance/exit choreography, never
 * for input affordances that must never stall mid-tween.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gold', size = 'md', block = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'btn',
        variant !== 'gold' && `btn-${variant}`,
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'px-[24px] py-[14px] text-[16px]',
        block && 'btn-block',
        className,
      )}
      {...rest}
    />
  )
})

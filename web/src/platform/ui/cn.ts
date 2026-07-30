import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes so a caller's className always wins over a variant default. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

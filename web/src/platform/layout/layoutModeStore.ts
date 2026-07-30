import { create } from 'zustand'

export type LayoutMode = 'auto' | 'mobile' | 'desktop'

const STORAGE_KEY = 'royal-casino:layout-mode'

function readStored(): LayoutMode {
  const v = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  return v === 'mobile' || v === 'desktop' ? v : 'auto'
}

/** Debug-only override for `useIsMobile()` — lets you force phone layout
 *  from a desktop browser without resizing the window. Defaults to 'auto',
 *  which just follows the real viewport width. */
export const useLayoutModeStore = create<{
  mode: LayoutMode
  setMode: (mode: LayoutMode) => void
}>((set) => ({
  mode: readStored(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    set({ mode })
  },
}))

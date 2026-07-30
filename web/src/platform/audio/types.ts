/* ============================================================
   Every game's sound pack (games/<Game>/sounds.ts) implements every one of
   these six cues, built from the primitives in engine.ts and themed to
   that specific game. Required (not partial) on purpose: a pack that's
   missing 'bigwin' would silently fall through to nothing at the exact
   moment a player just hit a jackpot, which is the one moment this can't
   afford to go quiet.
   ============================================================ */

export type SoundCue = 'click' | 'tick' | 'win' | 'bigwin' | 'cashout' | 'lose'

export type SoundPack = Record<SoundCue, () => void>

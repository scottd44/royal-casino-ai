import { useVoiceStore } from './voiceStore'

/* ============================================================
   AI voice — speaks the agent's own trash-talk `reason` line out loud as
   it plays, using the browser's built-in speech synthesis (SpeechSynthesis
   API). No external TTS service, no API key, no network call: it runs
   entirely on the player's own machine through whatever voices their OS/
   browser already ships, same "no external assets" rule the sound engine
   (platform/audio/engine.ts) follows.

   Wired into agentUi.ts's `logEvent()` — every 'move'/'loan' log entry
   that carries a non-empty `reason` gets spoken the moment it's logged,
   which is also the moment it appears in LabLog.tsx, so what you hear and
   what you read line up.
   ============================================================ */

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

/** Cancels whatever's currently being spoken (or queued) — called before
 *  every new line so a fast-playing AI (short "Move speed") never leaves a
 *  backlog of stale lines queued up behind the current one; you always
 *  hear the LATEST move, live, not a delayed replay of five moves ago. */
export function stopSpeaking(): void {
  const s = synth()
  if (s) s.cancel()
}

/** Speaks `text` if voice is enabled and the browser supports it. Silent
 *  no-op otherwise (older Safari/some embedded webviews lack
 *  SpeechSynthesis entirely — this must never throw). */
export function speak(text: string): void {
  const s = synth()
  if (!s || !useVoiceStore.getState().enabled) return
  const line = text.trim()
  if (!line) return

  s.cancel() // supersede whatever's still playing, see stopSpeaking() above
  const utter = new SpeechSynthesisUtterance(line)
  utter.rate = 1.05
  utter.pitch = 0.95
  utter.volume = 1
  try {
    s.speak(utter)
  } catch {
    // Speech synthesis unavailable/misbehaving — the AI Lab's log/toast
    // already show the same text, so this is a silent degrade, not a bug.
  }
}

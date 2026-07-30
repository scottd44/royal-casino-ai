/* ============================================================
   The agent's DOM contract, as data.

   Transcribed verbatim from HANDOFF-REACT-MIGRATION.md §2b, which was itself
   grepped out of js/agent/agent-ui.js. The agent never imports game code —
   the DOM *is* the API — so every id below is load-bearing public surface.

   This module exists so the rule can be ENFORCED rather than remembered:
   platform/motion/AnimatedNumber.tsx refuses to run a count-up on any id in
   NUMERIC_CONTRACT_IDS, and the DOM-contract test asserts the set still
   renders. Do not prune an id because the React build doesn't emit it yet —
   Phase 3 still has 22 games to port.
   ============================================================ */

/** Every element id agent-ui.js selects by. */
export const CONTRACT_IDS = [
  // inputs / shared controls
  'betInput', 'autoInput', 'targetInput', 'slider',
  // shared containers
  'board', 'grid', 'reels',
  // shared buttons
  'rollBtn', 'spinBtn', 'startBtn', 'dealBtn', 'drawBtn', 'hitBtn', 'standBtn',
  'doubleBtn', 'cashBtn', 'placeBetBtn',
  // multipliers / live figures
  'cashVal', 'curMult', 'nextMult', 'maxMult', 'runMult', 'bustChance', 'ballsLive',
  // crash / plinko / limbo
  'crashStage', 'plinkoStage', 'dropBtn', 'limboBtn', 'limboMsg',
  // mines
  'minesMsg', 'mineSelect', 'diffSelect',
  // hilo — agent-ui.js:848 also clicks #lowerBtn (`$(move === "lower" ? "#lowerBtn" : "#higherBtn")`);
  // this id was missing from the original §2b transcription, added here per PHASE_3_GAMES_PLAN.md §0.
  'higherBtn', 'lowerBtn', 'hiloCard', 'hiloMsg',
  // tower
  'towerGrid', 'towerStart', 'towerMsg', 'rowsClimbed',
  // wheel
  'wheelBtn', 'wheelStage',
  // chicken road
  'chkCross', 'chkStage', 'chkStart', 'chkCash', 'chkDiff', 'chkMsg', 'laneNum',
  // holdem
  'hcControls',
  // baccarat
  'bacDeal', 'bacResult',
  // three card poker — agent-ui.js's threecard.play() also clicks #tcpFold
  // (`$(dec.action === 'fold' ? '#tcpFold' : '#tcpPlay').click()`); this id
  // was missing from the original §2b transcription, added here per the
  // same reasoning as hilo's `lowerBtn` gap.
  'tcpDeal', 'tcpPlay', 'tcpFold', 'tcpPlayer',
  // casino war
  'warDeal', 'warGo', 'warP', 'warResult', 'warWarRow',
  // red dog
  'rdDeal', 'rdCards', 'rdActRow', 'rdPays', 'rdResult', 'rdSpreadV',
  // battleship
  'bsDeal', 'bsGrid', 'bsStatus',
  // moles
  'molGrid', 'molStart', 'molSelect', 'molMsg',
  // coinflip / rps
  'cfCoins', 'cfMsg', 'rpsTrack', 'rpsMsg',
  // snakes / keno
  'snBoard', 'snMsg', 'knBoard', 'knMsg',
  // gems / video poker / blackjack
  'gemGrid', 'gemSpinBtn', 'vpCards', 'vpResult', 'bjResult',
  'playerScore', 'playerCards', 'dealerCards',
  // the Lab's own contract — written directly by agent-ui.js setStatus()
  'aiStatus',
] as const

export type ContractId = (typeof CONTRACT_IDS)[number]

/* ------------------------------------------------------------
   The tween ban.

   agent-ui.js reads these with parseFloat/parseInt on raw textContent, at
   arbitrary times relative to render (waitFor polls every 60ms). A count-up
   animation on one of these nodes doesn't degrade the animation — it feeds
   the agent a WRONG NUMBER and it cashes out at the wrong multiplier.
   Nothing throws. Telemetry looks fine.

   Phase 0 discovery, restated: the id must sit on the raw value node, and
   that node's textContent must go from old value to new value in one step.
   ------------------------------------------------------------ */
export const NUMERIC_CONTRACT_IDS = [
  'curMult', 'nextMult', 'maxMult', 'runMult',
  'cashVal', 'bustChance', 'ballsLive',
  'rowsClimbed', 'laneNum', 'rdSpreadV', 'playerScore',
] as const

export type NumericContractId = (typeof NUMERIC_CONTRACT_IDS)[number]

const CONTRACT_SET: ReadonlySet<string> = new Set(CONTRACT_IDS)
const NUMERIC_SET: ReadonlySet<string> = new Set(NUMERIC_CONTRACT_IDS)

/** True if `id` is any part of the agent's DOM contract. */
export function isContractId(id: string | undefined | null): boolean {
  return !!id && CONTRACT_SET.has(id)
}

/**
 * True if `id` names a node the agent parses as a number. Such a node MUST
 * NOT tween: see the note above. AnimatedNumber calls this and degrades to an
 * instant write rather than trusting the caller to remember.
 */
export function isNumericContractId(id: string | undefined | null): boolean {
  return !!id && NUMERIC_SET.has(id)
}

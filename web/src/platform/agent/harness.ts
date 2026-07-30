/* ============================================================
   Royal Casino — Agent Harness
   ------------------------------------------------------------
   A lightweight, game-agnostic bridge to a local Ollama model
   using Ollama's native tool-calling API.

   It does ONE job: given a game state + a list of legal moves,
   ask the model to emit a structured `make_move` tool call and
   return the chosen action string back to your game loop.

   It knows NOTHING about slots/blackjack/etc. — you feed it a
   plain state object and legal moves; it hands you back a move.

   Docs: https://github.com/ollama/ollama/blob/main/docs/api.md#chat

   Ported line-for-line from js/agent/harness.js (Phase 2 §2). Zero
   DOM/window references in the original, so this port only adds types —
   no behavior changed. The one intentional difference from the original:
   this class is a named export with no module-scope side effects (the
   original ended with `window.OllamaAgent = OllamaAgent`, relying on being
   a classic script global — here `agentUi.ts` does `new OllamaAgent(...)`
   itself, per plan §0.3.2 / §2).
   ============================================================ */

/** One chat message in Ollama's `/api/chat` request format. */
type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** The JSON-schema tool definition Ollama expects in `tools`. */
type ToolSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

type OllamaToolCall = {
  function?: {
    name: string
    arguments: unknown
  }
}

type OllamaMessage = {
  content?: string
  tool_calls?: OllamaToolCall[]
}

/** The parsed JSON response from Ollama's `/api/chat` (non-streaming). */
export type OllamaChatResponse = {
  message?: OllamaMessage
  [key: string]: unknown
}

export type OllamaAgentOptions = {
  /** Ollama model tag (default qwen2.5:7b) */
  model?: string
  /** Chat endpoint URL */
  endpoint?: string
  /** Sampling temperature */
  temperature?: number
  /** max tokens per decision (null = model default) */
  numPredict?: number | null
  /** GPU layers: null = default (GPU on Apple Silicon), 0 = CPU-only */
  numGpu?: number | null
  /** Abort the request after this long */
  timeoutMs?: number
  /** Optional logger */
  onLog?: (msg: string, data?: unknown) => void
}

export type DecideMoveArgs = {
  /** Arbitrary JSON describing the table
   *  (e.g. { dealer_upcard: 7, player_hand: [10,6], player_total: 16 }) */
  gameState: Record<string, unknown>
  /** Allowed action strings (e.g. ["hit","stand","double"]) */
  legalMoves: string[]
  /** Human label used in the prompt ("Blackjack") */
  gameName?: string
  /** Optional extra rules/strategy hints for the system prompt */
  rules?: string
  persona?: string
  sessionContext?: Record<string, unknown> | null
  /** Extra JSON-schema properties to collect alongside `move`
   *  (e.g. { amount: { type:"integer", description:"bet size" } }) */
  extraArgs?: Record<string, unknown>
  /** Which of extraArgs are required */
  extraRequired?: string[]
  /** How many times to re-prompt if no tool call comes back */
  retries?: number
}

export type DecideMoveResult = {
  action: string
  args: Record<string, unknown>
  reasoning: string
  latencyMs: number
  /** >1 means the model needed a nudge (reliability signal) */
  attempts: number
  raw: OllamaChatResponse
}

export class OllamaAgent {
  model: string
  endpoint: string
  temperature: number
  numPredict: number | null
  numGpu: number | null
  timeoutMs: number
  onLog: (msg: string, data?: unknown) => void

  private _controller: AbortController | null = null
  private _userAborted = false

  constructor(opts: OllamaAgentOptions = {}) {
    this.model = opts.model || 'qwen2.5:7b'
    this.endpoint = opts.endpoint || 'http://localhost:11434/api/chat'
    this.temperature = opts.temperature ?? 0.4
    this.numPredict = opts.numPredict ?? null // max tokens per decision (null = model default)
    this.numGpu = opts.numGpu ?? null // GPU layers: null = default (GPU on Apple Silicon), 0 = CPU-only
    this.timeoutMs = opts.timeoutMs ?? 30000
    this.onLog = opts.onLog || (() => {})
  }

  /** Ask the model to choose one legal move for the given state. */
  async decideMove({
    gameState,
    legalMoves,
    gameName = 'casino game',
    rules = '',
    persona = '',
    sessionContext = null,
    extraArgs = {},
    extraRequired = [],
    retries = 1,
  }: DecideMoveArgs): Promise<DecideMoveResult> {
    if (!Array.isArray(legalMoves) || legalMoves.length === 0) {
      throw new Error('OllamaAgent.decideMove: legalMoves must be a non-empty array')
    }

    const tool = this._buildTool(legalMoves, extraArgs, extraRequired)
    const personaLine =
      persona ||
      `You are a disciplined casino player playing ${gameName}. Choose the strategically strongest legal move.`
    const system =
      personaLine + ' ' +
      `You are playing ${gameName}. You will be given your session context and the current game state as JSON. ` +
      `You MUST respond by calling the make_move function exactly once with a legal move. ` +
      `Do not add commentary.` +
      (rules ? `\n\nRules & strategy notes:\n${rules}` : '')

    const userContent =
      (sessionContext
        ? `Your session so far (bankroll & momentum — factor this into your decision):\n${JSON.stringify(sessionContext, null, 2)}\n\n`
        : '') +
      `Current game state:\n${JSON.stringify(gameState, null, 2)}\n\n` +
      `Legal moves: ${legalMoves.join(', ')}.\n` +
      `Call make_move now.`

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ]

    let lastRaw: OllamaChatResponse | null = null
    const t0 = (performance || Date).now()
    for (let attempt = 0; attempt <= retries; attempt++) {
      const data = await this._chat({ messages, tools: [tool] })
      lastRaw = data
      const call = OllamaAgent.parseToolCall(data.message, 'make_move')

      if (call && legalMoves.includes(call.args.move as string)) {
        this.onLog(`Model chose: ${call.args.move}`, call.args)
        return {
          action: call.args.move as string,
          args: call.args,
          reasoning: (call.args.reason as string) || (data.message && data.message.content) || '',
          latencyMs: Math.round((performance || Date).now() - t0),
          attempts: attempt + 1, // >1 means the model needed a nudge (reliability signal)
          raw: data,
        }
      }

      // No usable tool call — nudge the model and try again.
      this.onLog(`No valid tool call (attempt ${attempt + 1}); retrying`, data.message)
      messages.push({
        role: 'user',
        content:
          `That was not a valid tool call. You must call make_move with "move" set to ` +
          `exactly one of: ${legalMoves.join(', ')}.`,
      })
    }

    // Give up gracefully so the caller can fall back to a default move.
    throw new OllamaAgentError(
      `Model did not return a legal move after ${retries + 1} attempts`,
      lastRaw,
    )
  }

  /** Freeform completion (no tools) — used for the end-of-session report narrative. */
  async complete({
    system,
    prompt,
    temperature = 0.6,
  }: {
    system?: string
    prompt: string
    temperature?: number
  }): Promise<string> {
    const messages: ChatMessage[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const data = await this._chat({ messages, temperature })
    return (data.message && data.message.content) || ''
  }

  /** Low-level chat call. Returns the parsed Ollama JSON response. */
  private async _chat({
    messages,
    tools,
    temperature,
  }: {
    messages: ChatMessage[]
    tools?: ToolSchema[]
    temperature?: number
  }): Promise<OllamaChatResponse> {
    const payload = {
      model: this.model,
      messages,
      tools,
      stream: false, // we want the full message (with tool_calls) in one shot
      options: {
        temperature: temperature ?? this.temperature,
        ...(this.numPredict ? { num_predict: this.numPredict } : {}),
        ...(this.numGpu !== null ? { num_gpu: this.numGpu } : {}),
      },
    }

    const controller = new AbortController()
    this._controller = controller // so abort() can cancel the in-flight call
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (this._controller === controller) this._controller = null
      if (err instanceof Error && err.name === 'AbortError') {
        // user Stop or timeout — either way the run loop stops cleanly
        throw new OllamaAgentError(
          this._userAborted ? 'stopped by user' : `Ollama request timed out after ${this.timeoutMs}ms`,
        )
      }
      // Most commonly: Ollama not running, or a CORS block.
      const message = err instanceof Error ? err.message : String(err)
      throw new OllamaAgentError(
        `Could not reach Ollama at ${this.endpoint}. Is it running, and is CORS allowed? ` +
          `(${message})`,
      )
    }
    clearTimeout(timer)
    if (this._controller === controller) this._controller = null

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new OllamaAgentError(`Ollama returned HTTP ${res.status}: ${text}`)
    }
    return res.json() as Promise<OllamaChatResponse>
  }

  /** Abort any in-flight request immediately (used by the Stop button). */
  abort(): void {
    this._userAborted = true
    try {
      this._controller && this._controller.abort()
    } catch {
      /* noop */
    }
    // reset the flag shortly after so future timeouts read correctly
    setTimeout(() => {
      this._userAborted = false
    }, 250)
  }

  /** Build the JSON-schema tool definition Ollama expects. */
  private _buildTool(
    legalMoves: string[],
    extraArgs: Record<string, unknown>,
    extraRequired: string[],
  ): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'make_move',
        description:
          'Submit the single move you want to play this turn. ' +
          "'move' must be one of the currently legal moves.",
        parameters: {
          type: 'object',
          properties: {
            move: {
              type: 'string',
              description: 'The action to take this turn.',
              enum: legalMoves,
            },
            reason: {
              type: 'string',
              description:
                'One short, human sentence: your gut read and how you feel about this move — not just the math.',
            },
            ...extraArgs,
          },
          required: ['move', ...extraRequired],
        },
      },
    }
  }

  /**
   * Pull the first matching tool call out of an Ollama assistant message.
   * Ollama returns `arguments` as an object; some builds/models return a
   * JSON string — this handles both.
   */
  static parseToolCall(
    message: OllamaMessage | undefined,
    expectedName?: string,
  ): { name: string; args: Record<string, unknown> } | null {
    if (!message || !Array.isArray(message.tool_calls)) return null
    for (const tc of message.tool_calls) {
      const fn = tc && tc.function
      if (!fn) continue
      if (expectedName && fn.name !== expectedName) continue
      let args: unknown = fn.arguments
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args)
        } catch {
          args = {}
        }
      }
      return { name: fn.name, args: (args as Record<string, unknown>) || {} }
    }
    return null
  }
}

/** Typed error so callers can distinguish transport/parse failures. */
export class OllamaAgentError extends Error {
  raw: unknown
  constructor(message: string, raw?: unknown) {
    super(message)
    this.name = 'OllamaAgentError'
    this.raw = raw
  }
}

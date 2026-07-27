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
   ============================================================ */
class OllamaAgent {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]        Ollama model tag (default qwen2.5:7b)
   * @param {string} [opts.endpoint]     Chat endpoint URL
   * @param {number} [opts.temperature]  Sampling temperature
   * @param {number} [opts.timeoutMs]    Abort the request after this long
   * @param {(msg:string,data?:any)=>void} [opts.onLog]  Optional logger
   */
  constructor(opts = {}) {
    this.model = opts.model || "qwen2.5:7b";
    this.endpoint = opts.endpoint || "http://localhost:11434/api/chat";
    this.temperature = opts.temperature ?? 0.4;
    this.numPredict = opts.numPredict ?? null; // max tokens per decision (null = model default)
    this.numGpu = opts.numGpu ?? null;         // GPU layers: null = default (GPU on Apple Silicon), 0 = CPU-only
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.onLog = opts.onLog || (() => {});
  }

  /**
   * Ask the model to choose one legal move for the given state.
   *
   * @param {object} args
   * @param {object} args.gameState      Arbitrary JSON describing the table
   *                                     (e.g. { dealer_upcard: 7, player_hand: [10,6], player_total: 16 })
   * @param {string[]} args.legalMoves   Allowed action strings (e.g. ["hit","stand","double"])
   * @param {string} [args.gameName]     Human label used in the prompt ("Blackjack")
   * @param {string} [args.rules]        Optional extra rules/strategy hints for the system prompt
   * @param {object} [args.extraArgs]    Extra JSON-schema properties to collect alongside `move`
   *                                     (e.g. { amount: { type:"integer", description:"bet size" } })
   * @param {string[]} [args.extraRequired]  Which of extraArgs are required
   * @param {number}  [args.retries]     How many times to re-prompt if no tool call comes back
   * @returns {Promise<{action:string, args:object, reasoning:string, raw:object}>}
   */
  async decideMove({
    gameState,
    legalMoves,
    gameName = "casino game",
    rules = "",
    persona = "",
    sessionContext = null,
    extraArgs = {},
    extraRequired = [],
    retries = 1,
  }) {
    if (!Array.isArray(legalMoves) || legalMoves.length === 0) {
      throw new Error("OllamaAgent.decideMove: legalMoves must be a non-empty array");
    }

    const tool = this._buildTool(legalMoves, extraArgs, extraRequired);
    const personaLine =
      persona ||
      `You are a disciplined casino player playing ${gameName}. Choose the strategically strongest legal move.`;
    const system =
      personaLine + " " +
      `You are playing ${gameName}. You will be given your session context and the current game state as JSON. ` +
      `You MUST respond by calling the make_move function exactly once with a legal move. ` +
      `Do not add commentary.` +
      (rules ? `\n\nRules & strategy notes:\n${rules}` : "");

    const userContent =
      (sessionContext
        ? `Your session so far (bankroll & momentum — factor this into your decision):\n${JSON.stringify(sessionContext, null, 2)}\n\n`
        : "") +
      `Current game state:\n${JSON.stringify(gameState, null, 2)}\n\n` +
      `Legal moves: ${legalMoves.join(", ")}.\n` +
      `Call make_move now.`;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    let lastRaw = null;
    const t0 = (performance || Date).now();
    for (let attempt = 0; attempt <= retries; attempt++) {
      const data = await this._chat({ messages, tools: [tool] });
      lastRaw = data;
      const call = OllamaAgent.parseToolCall(data.message, "make_move");

      if (call && legalMoves.includes(call.args.move)) {
        this.onLog(`Model chose: ${call.args.move}`, call.args);
        return {
          action: call.args.move,
          args: call.args,
          reasoning: call.args.reason || (data.message && data.message.content) || "",
          latencyMs: Math.round((performance || Date).now() - t0),
          attempts: attempt + 1, // >1 means the model needed a nudge (reliability signal)
          raw: data,
        };
      }

      // No usable tool call — nudge the model and try again.
      this.onLog(`No valid tool call (attempt ${attempt + 1}); retrying`, data.message);
      messages.push({
        role: "user",
        content:
          `That was not a valid tool call. You must call make_move with "move" set to ` +
          `exactly one of: ${legalMoves.join(", ")}.`,
      });
    }

    // Give up gracefully so the caller can fall back to a default move.
    throw new OllamaAgentError(
      `Model did not return a legal move after ${retries + 1} attempts`,
      lastRaw
    );
  }

  /**
   * Freeform completion (no tools) — used for the end-of-session report narrative.
   * @returns {Promise<string>} the assistant's text
   */
  async complete({ system, prompt, temperature = 0.6 }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const data = await this._chat({ messages, temperature });
    return (data.message && data.message.content) || "";
  }

  /** Low-level chat call. Returns the parsed Ollama JSON response. */
  async _chat({ messages, tools, temperature }) {
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
    };

    const controller = new AbortController();
    this._controller = controller;              // so abort() can cancel the in-flight call
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (this._controller === controller) this._controller = null;
      if (err.name === "AbortError") {
        // user Stop or timeout — either way the run loop stops cleanly
        throw new OllamaAgentError(this._userAborted ? "stopped by user" : `Ollama request timed out after ${this.timeoutMs}ms`);
      }
      // Most commonly: Ollama not running, or a CORS block.
      throw new OllamaAgentError(
        `Could not reach Ollama at ${this.endpoint}. Is it running, and is CORS allowed? ` +
        `(${err.message})`
      );
    }
    clearTimeout(timer);
    if (this._controller === controller) this._controller = null;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OllamaAgentError(`Ollama returned HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }

  /** Abort any in-flight request immediately (used by the Stop button). */
  abort() {
    this._userAborted = true;
    try { this._controller && this._controller.abort(); } catch (e) { /* noop */ }
    // reset the flag shortly after so future timeouts read correctly
    setTimeout(() => { this._userAborted = false; }, 250);
  }

  /** Build the JSON-schema tool definition Ollama expects. */
  _buildTool(legalMoves, extraArgs, extraRequired) {
    return {
      type: "function",
      function: {
        name: "make_move",
        description:
          "Submit the single move you want to play this turn. " +
          "'move' must be one of the currently legal moves.",
        parameters: {
          type: "object",
          properties: {
            move: {
              type: "string",
              description: "The action to take this turn.",
              enum: legalMoves,
            },
            reason: {
              type: "string",
              description: "One short, human sentence: your gut read and how you feel about this move — not just the math.",
            },
            ...extraArgs,
          },
          required: ["move", ...extraRequired],
        },
      },
    };
  }

  /**
   * Pull the first matching tool call out of an Ollama assistant message.
   * Ollama returns `arguments` as an object; some builds/models return a
   * JSON string — this handles both.
   *
   * @returns {{name:string, args:object} | null}
   */
  static parseToolCall(message, expectedName) {
    if (!message || !Array.isArray(message.tool_calls)) return null;
    for (const tc of message.tool_calls) {
      const fn = tc && tc.function;
      if (!fn) continue;
      if (expectedName && fn.name !== expectedName) continue;
      let args = fn.arguments;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      return { name: fn.name, args: args || {} };
    }
    return null;
  }
}

/** Typed error so callers can distinguish transport/parse failures. */
class OllamaAgentError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = "OllamaAgentError";
    this.raw = raw;
  }
}

// Expose globally (matches the plain <script> style of the rest of the app).
window.OllamaAgent = OllamaAgent;
window.OllamaAgentError = OllamaAgentError;

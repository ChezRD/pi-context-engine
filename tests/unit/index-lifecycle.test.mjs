// Integration test: pi-context-engine with mocked pi runtime
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

let deepSeekCache, syncModelSelection, getCacheCompletions;

before(async () => {
  const mod = await import("../../src/index.ts");
  deepSeekCache = mod.default;
  syncModelSelection = mod.syncModelSelection;
  getCacheCompletions = mod.getCacheCompletions;
});

function makePi(opts = {}) {
  const listeners = {};
  const commands = [];
  const tools = [];
  return {
    on: (e, h) => {
      if (!listeners[e]) listeners[e] = [];
      listeners[e].push(h);
    },
    sendMessage: () => {},
    getActiveTools: () => tools,
    registerTool: (t) => tools.push(t),
    registerCommand: (name, def) => commands.push({ name, ...def }),
    compact: () => ({ ok: true, folded: false }),
    appendEntry: () => true,
    setStatus: () => {},
    model: { id: "gpt-4o", provider: "openai" },
    getContextUsage: () => ({ ratio: 0.5, tokens: 500, ctxMax: 64000, maxTokens: 64000 }),
    ui: { setStatus: () => {}, render: () => {} },
    config: opts.config || {},
    engine: opts.engine || {},
    _listeners: listeners,
    _commands: commands,
    _tools: tools,
  };
}

describe("deepSeekCache (full init)", () => {
  it("registers lifecycle handlers and commands", async () => {
    const pi = makePi({ config: { 
      locale: "en", statusLine: true, enabled: true, autoFold: true,
      foldTailPct: 0.2, foldThreshold: 0.75, aggressiveFoldThreshold: 0.85,
      contextWarnPct: 0.6, contextDangerPct: 0.72, minTurnsBetweenCompacts: 3,
      hugeResultCapper: true, pruneOn: "every-turn", pruneBatchSize: 5,
      autoCompactAtHighWatermark: true, pruneModel: "auto", foldSummaryModel: "auto",
    }});
    const ctx = { sessionManager: null, modelRegistry: null };
    
    await deepSeekCache(pi, ctx);
    
    assert.ok(pi._listeners.session_start, "session_start handler registered");
    assert.ok(pi._listeners.turn_end, "turn_end handler registered");
    assert.ok(pi._listeners.input, "input handler registered");
    assert.ok(pi._listeners.context, "context handler registered");
    assert.ok(pi._commands.length > 0, "commands registered");
  });

  it("registered dashboard command and timeline tool read current state", async () => {
    const pi = makePi({ config: { enabled: true, locale: "en" } });
    const ctx = {
      sessionManager: {
        getBranch: () => [{ id: "root", type: "message", message: { role: "user", content: "Hello" } }],
        getTree: () => [],
        getLeafId: () => "root",
        getLabel: () => undefined,
      },
      getContextUsage: async () => ({ percent: 10, tokens: 1000, contextWindow: 10000 }),
      ui: { notify: () => {}, custom: undefined },
    };

    await deepSeekCache(pi, ctx);
    const dashboard = pi._commands.find((command) => command.name === "context");
    const timeline = pi._tools.find((tool) => tool.name === "context_timeline");

    assert.ok(dashboard);
    assert.ok(timeline);
    await dashboard.handler("", ctx);
    const result = await timeline.execute("call-1", {}, undefined, undefined, ctx);
    assert.ok(result.content[0].text.includes("Context Usage"));
  });

  it("handles session_start lifecycle", async () => {
    const pi = makePi({ config: { enabled: true, locale: "en" } });
    await deepSeekCache(pi, { sessionManager: null });
    await pi._listeners.session_start[0]();
    assert.ok(true, "session_start completed");
  });

  it("handles input lifecycle", async () => {
    const pi = makePi({ config: { enabled: true, locale: "en", statusLine: true } });
    await deepSeekCache(pi, { sessionManager: null });
    if (pi._listeners.input[0]) {
      await pi._listeners.input[0]();
    }
    assert.ok(true, "input completed");
  });

  it("handles turn_end lifecycle", async () => {
    const pi = makePi({ config: { enabled: true, locale: "en", autoFold: true, autoCompactAtHighWatermark: true, minTurnsBetweenCompacts: 3, pruneOn: "every-turn", pruneBatchSize: 5 } });
    await deepSeekCache(pi, { sessionManager: null });
    await pi._listeners.turn_end[0]();
    assert.ok(true, "turn_end completed");
  });
});

describe("syncModelSelection", () => {
  it("syncs model from ctx", () => {
    const pi = makePi({});
    const state = { config: { locale: "en" }, engine: {}, stats: { requests: 0 }, detection: { kind: "not-deepseek", provider: "", modelId: "" } };
    syncModelSelection({ model: { id: "claude-3", provider: "anthropic" } }, state);
    assert.equal(state.detection.modelId, "claude-3");
    assert.ok(true);
  });
});

describe("getCacheCompletions", () => {
  it("returns array of completions", () => {
    // smoke test — ensure function exists and returns array
    const result = getCacheCompletions("di");
    assert.ok(Array.isArray(result) || result === undefined);
  });
});

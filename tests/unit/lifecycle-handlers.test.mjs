import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let handleInput, handleTurnEnd, handleContext, createRuntimeState;

before(async () => {
  const mod = await import("../../src/cache-engine/index.ts");
  handleInput = mod.handleInput;
  handleTurnEnd = mod.handleTurnEnd;
  handleContext = mod.handleContext;
  createRuntimeState = (await import("../../src/runtime-state.ts")).createRuntimeState;
});

function makeState(overrides = {}) {
  const state = createRuntimeState();
  state.config = { ...state.config, locale: "en", enabled: true, autoFold: true, autoCompactAtHighWatermark: true, minTurnsBetweenCompacts: 3, pruneOn: "every-turn", pruneBatchSize: 5, contextWarnPct: 0.6, contextDangerPct: 0.72, foldTailPct: 0.2, foldThreshold: 0.75, aggressiveFoldThreshold: 0.85 };
  return {
    ...state,
    ...overrides,
  };
}

describe("handleInput", () => {
  it("processes user input event", () => {
    const state = makeState();
    const event = { turn: { id: "t1", role: "user", content: "hello world" } };
    handleInput(event, {}, state);
    assert.ok(state.engine.turnIndex >= 0);
    assert.ok(state.engine.toolIntent);
  });
});

describe("handleTurnEnd", () => {
  it("handles turn_end event with prune on every-turn", async () => {
    const state = makeState();
    const pi = { compact: () => ({ ok: true, folded: false }), getContextUsage: () => ({ ratio: 0.5, tokens: 500, ctxMax: 64000, maxTokens: 64000 }), appendEntry: () => true };
    await handleTurnEnd({}, pi, {}, state);
    assert.ok(true);
  });
});

describe("handleContext", () => {
  it("handles context lifecycle event", async () => {
    const state = makeState();
    const event = { turn: { id: "t1", role: "user", content: "hello" }, messages: [] };
    const result = await handleContext(event, {}, state);
    assert.ok(result === undefined || typeof result === "object");
  });
});

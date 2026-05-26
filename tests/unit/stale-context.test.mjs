import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = {};
const emptyStats = {
	requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0,
	cost: 0, savings: 0, sinceCompactionRequests: 0, usages: [], compacts: [],
	last: undefined,
};
const cfg = {
	foldThreshold: 0.75, aggressiveFoldThreshold: 0.78, exitSummaryThreshold: 0.80,
	preflightFoldThreshold: 0.90, foldTailPct: 0.10, aggressiveFoldTailPct: 0.15,
	minFoldSavings: 0.30, contextCompactPct: 0.70, contextForceFoldPct: 0.85,
	maxCompactsPerSession: 5, foldInterval: 3, appendOnlyProjection: false,
	locale: "en", enableAgenticTools: true, pruneEnabled: true, pruneOn: "every-turn",
	showCostSavings: true, showTurnEstimate: true, hugeResultCapper: true,
	statusLine: true, registerDynamicProvider: true, enabled: true,
};

describe("stale-context.ts", () => {
  it("loads module and functions", async () => {
m.createRuntimeState = (await import("../../src/runtime-state.ts")).createRuntimeState;
    assert.ok(m.createRuntimeState);
  });

describe("isStaleContextError", () => {
  it("matches known stale patterns", async () => {
    const { isStaleContextError } = await import("../../src/stale-context.ts");
    assert.equal(isStaleContextError(new Error("ctx is stale after session replacement")), true);
    assert.equal(isStaleContextError(new Error("This extension ctx is stale")), true);
    assert.equal(isStaleContextError(new Error("random error")), false);
  });
  it("handles non-Error thrown values", async () => {
    const { isStaleContextError } = await import("../../src/stale-context.ts");
    assert.equal(isStaleContextError("string error"), false);
    assert.equal(isStaleContextError(null), false);
    assert.equal(isStaleContextError(undefined), false);
  });
});

describe("safeCall", () => {
  it("returns function result on success", async () => {
    const { safeCall } = await import("../../src/stale-context.ts");
    assert.equal(safeCall(() => 42, -1), 42);
  });
  it("returns fallback on stale context error", async () => {
    const { safeCall } = await import("../../src/stale-context.ts");
    assert.equal(safeCall(() => { throw new Error("ctx is stale after session replacement"); }, "fallback"), "fallback");
  });
  it("rethrows non-stale errors", async () => {
    const { safeCall } = await import("../../src/stale-context.ts");
    assert.throws(() => safeCall(() => { throw new Error("real error"); }, "fallback"), /real error/);
  });
  it("handles non-Error thrown values", async () => {
    const { safeCall, isStaleContextError } = await import("../../src/stale-context.ts");
    assert.equal(isStaleContextError("string error"), false);
    assert.equal(isStaleContextError(null), false);
    assert.equal(isStaleContextError(undefined), false);
    assert.throws(() => safeCall(() => { throw "string"; }, "fallback"));
    assert.throws(() => safeCall(() => { throw null; }, "fallback"));
  });
});

describe("safeCallAsync", () => {
  it("returns function result on success", async () => {
    const { safeCallAsync } = await import("../../src/stale-context.ts");
    const result = await safeCallAsync(async () => 42, -1);
    assert.equal(result, 42);
  });
  it("returns fallback on stale context error", async () => {
    const { safeCallAsync } = await import("../../src/stale-context.ts");
    const result = await safeCallAsync(async () => { throw new Error("ctx is stale after session replacement"); }, "fallback");
    assert.equal(result, "fallback");
  });
  it("rethrows non-stale errors", async () => {
    const { safeCallAsync } = await import("../../src/stale-context.ts");
    await assert.rejects(safeCallAsync(async () => { throw new Error("real error"); }, "fallback"), /real error/);
  });
});

describe("safeAppendEntry", () => {
  it("returns false when pi has no appendEntry", async () => {
    const { safeAppendEntry } = await import("../../src/stale-context.ts");
    assert.equal(safeAppendEntry({}, "test"), false);
  });
  it("appends successfully and returns true", async () => {
    const { safeAppendEntry } = await import("../../src/stale-context.ts");
    const calls = [];
    const pi = { appendEntry: (type, data) => calls.push({ type, data }) };
    assert.equal(safeAppendEntry(pi, "test-type", { key: "value" }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "test-type");
  });
  it("returns false on stale context error", async () => {
    const { safeAppendEntry } = await import("../../src/stale-context.ts");
    const pi = { appendEntry: () => { throw new Error("This extension ctx is stale"); } };
    assert.equal(safeAppendEntry(pi, "test"), false);
  });
  it("rethrows non-stale errors from appendEntry", async () => {
    const { safeAppendEntry } = await import("../../src/stale-context.ts");
    const pi = { appendEntry: () => { throw new Error("real error"); } };
    assert.throws(() => safeAppendEntry(pi, "test"), /real error/);
  });
});

describe("restoreTelemetryFromSession", () => {
  it("initializes summarizeCacheReadTokens and summarizeByModel via nullish coalescing", async () => {
    const { CUSTOM_TYPE_TELEMETRY } = await import("../../src/telemetry-persistence.ts");
    const { restoreTelemetryFromSession } = await import("../../src/telemetry-persistence.ts");
    const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
    state.engine.prune.impact = { summarizeRequests: 1, summarizeInputTokens: 10 };
    const entries = [{ type: "custom", customType: CUSTOM_TYPE_TELEMETRY, data: { version: 1, stats: state.stats, engine: { prune: { impact: { summarizeRequests: 1 } } } } }];
    const result = restoreTelemetryFromSession({ sessionManager: { getEntries: () => entries } }, state);
    assert.equal(result, true);
    assert.equal(state.engine.prune.impact.summarizeCacheReadTokens, 0);
    assert.deepEqual(state.engine.prune.impact.summarizeByModel, []);
  });
});
});

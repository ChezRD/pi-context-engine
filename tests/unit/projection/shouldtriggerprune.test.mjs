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

describe("shouldTriggerPrune", () => {
  it("loads module and functions", async () => {
m.shouldTriggerPrune = (await import("../../../src/projection/batch-capture.ts")).shouldTriggerPrune;
    assert.ok(m.shouldTriggerPrune);
  });

describe("shouldTriggerPrune", () => {
	it("every-turn triggers with tools", () => assert.ok(m.shouldTriggerPrune("every-turn", 0, 1, true)));
	it("every-turn ignores batch threshold", () => assert.ok(m.shouldTriggerPrune("every-turn", 1, 3, true)));
	it("every-turn skips without tools", () => assert.equal(m.shouldTriggerPrune("every-turn", 0, 1, false), false));
	it("agent-message triggers at threshold", () => assert.ok(m.shouldTriggerPrune("agent-message", 3, 3, false)));
	it("agent-message skips below threshold", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false), false));
	it("agent-message does not flush early on pure text replies", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false, true), false));
	it("checkpoint never auto-triggers without context_checkpoint", () => assert.equal(m.shouldTriggerPrune("checkpoint", 10, 1, true), false));
	it("on-demand never auto-triggers", () => assert.equal(m.shouldTriggerPrune("on-demand", 10, 1, true), false));
	it("agentic-auto requires tools and threshold", () => {
		assert.equal(m.shouldTriggerPrune("agentic-auto", 1, 2, true), false);
		assert.equal(m.shouldTriggerPrune("agentic-auto", 2, 2, false), false);
		assert.equal(m.shouldTriggerPrune("agentic-auto", 2, 2, true), true);
	});
	it("unknown modes default to hasTools", () => {
		assert.equal(m.shouldTriggerPrune("custom", 0, 1, true), true);
		assert.equal(m.shouldTriggerPrune("custom", 0, 1, false), false);
	});
});
});

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

describe("canCompactNow", () => {
  it("loads module and functions", async () => {
m.canCompactNow = (await import("../../../src/cache-engine/decision-engine.ts")).canCompactNow;
    assert.ok(m.canCompactNow);
  });

describe("canCompactNow", () => {
	it("returns true when allowed", () => {
		const state = { engine: { compactCount: 1 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.ok(m.canCompactNow(state));
	});
	it("blocks when at max compacts", () => {
		const state = { engine: { compactCount: 5 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.equal(m.canCompactNow(state), false);
	});
	it("blocks when compact count exceeds the configured maximum", () => {
		const state = { engine: { compactCount: 6 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.equal(m.canCompactNow(state), false);
	});
	it("allows compaction when no previous compact turn was recorded", () => {
		const state = { engine: { compactCount: 0, lastCompactTurn: undefined, turnIndex: 5 }, config: { maxCompactsPerSession: 5, minTurnsBetweenCompacts: 3 } };
		assert.equal(m.canCompactNow(state), true);
	});
});
});

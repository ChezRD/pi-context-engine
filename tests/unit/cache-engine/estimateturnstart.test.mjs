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

describe("estimateTurnStart", () => {
  it("loads module and functions", async () => {
m.estimateTurnStart = (await import("../../../src/cache-engine/decision-engine.ts")).estimateTurnStart;
    assert.ok(m.estimateTurnStart);
  });

describe("estimateTurnStart", () => {
	it("triggers at 90%", () => assert.ok(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.92 }) }, cfg).shouldFold));
	it("no fold below 90%", () => assert.equal(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.70 }) }, cfg).shouldFold, false));
	it("missing getContextUsage", () => assert.equal(m.estimateTurnStart({}, cfg).shouldFold, false));
	it("returns false when ratio is undefined", () => assert.equal(m.estimateTurnStart({ getContextUsage: () => ({}) }, cfg).shouldFold, false));
});
});

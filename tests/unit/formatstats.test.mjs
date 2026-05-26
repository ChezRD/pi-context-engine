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

describe("formatStats", () => {
  it("loads module and functions", async () => {
m.emptyStats = (await import("../../src/stats.ts")).emptyStats;
m.formatStats = (await import("../../src/stats.ts")).formatStats;
    assert.ok(m.emptyStats);
  });

describe("formatStats", () => {
	it("formats stats", () => {
		const stats = m.emptyStats();
		const result = m.formatStats(stats);
		assert.ok(result.includes("input_tokens"));
	});
	it("formats stats with cost and savings", () => {
		const stats = { ...m.emptyStats(), requests: 5, input: 1000, cacheRead: 800, cacheWrite: 200, output: 500, cost: 0.05, savings: 0.02, sinceCompactionRequests: 3 };
		const result = m.formatStats(stats);
		assert.ok(result.includes("$0.050000"));
		assert.ok(result.includes("$0.020000"));
		assert.ok(result.includes("requests: 5"));
	});
});
});

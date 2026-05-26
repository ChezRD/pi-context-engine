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

describe("isFoldValid", () => {
  it("loads module and functions", async () => {
m.isFoldValid = (await import("../../../src/projection/history-folder.ts")).isFoldValid;
    assert.ok(m.isFoldValid);
  });

describe("isFoldValid", () => {
	it("returns false when not active", () => {
		const state = { engine: { semanticFold: { active: false } } };
		assert.equal(m.isFoldValid(state, "abc"), false);
	});
	it("returns true when fold active and prefix hash matches", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state, "abc"), true);
	});
	it("returns false when prefix hash mismatches", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state, "xyz"), false);
	});
	it("returns true when fold is active and no prefix hash has been recorded", () => {
		const state = { engine: { semanticFold: { active: true } } };
		assert.equal(m.isFoldValid(state, "xyz"), true);
	});
	it("returns true when fold is active and no system hash is supplied", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state), true);
	});
});
});

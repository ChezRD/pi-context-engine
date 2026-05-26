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

describe("clearFold", () => {
  it("loads module and functions", async () => {
m.clearFold = (await import("../../../src/projection/history-folder.ts")).clearFold;
    assert.ok(m.clearFold);
  });

describe("clearFold", () => {
	it("resets fold state to inactive", () => {
		const st = { engine: { semanticFold: { foldedHeadHash: "abc", active: true, foldedMessage: { content: "x" }, lastPinnedSkills: [], lastPinnedConstraints: [] } } };
		m.clearFold(st);
		assert.equal(st.engine.semanticFold.active, false);
		assert.equal(st.engine.semanticFold.foldedThisTurn, false);
	});
});
});

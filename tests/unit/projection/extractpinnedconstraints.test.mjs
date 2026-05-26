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

describe("extractPinnedConstraints", () => {
  it("loads module and functions", async () => {
m.extractPinnedConstraints = (await import("../../../src/projection/history-folder.ts")).extractPinnedConstraints;
    assert.ok(m.extractPinnedConstraints);
  });

describe("extractPinnedConstraints", () => {
	it("finds bracket HIGH PRIORITY", () => {
		const c = m.extractPinnedConstraints([{ role: "system", content: "[HIGH PRIORITY] critical\n\nother" }]);
		assert.ok(c.some(x => x.includes("HIGH PRIORITY")));
	});
	it("returns empty for no constraints", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: "hi" }]).length, 0));
	it("handles non-string content", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: ["hi"] }]).length, 0));
});
});

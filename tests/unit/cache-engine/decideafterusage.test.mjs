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

describe("decideAfterUsage", () => {
  it("loads module and functions", async () => {
m.decideAfterUsage = (await import("../../../src/cache-engine/decision-engine.ts")).decideAfterUsage;
    assert.ok(m.decideAfterUsage);
  });

describe("decideAfterUsage", () => {
	it("none below threshold", () => assert.equal(m.decideAfterUsage(700, 1000, false, cfg).kind, "none"));
	it("fold at 75%", () => {
		const d = m.decideAfterUsage(760, 1000, false, cfg);
		assert.equal(d.kind, "fold");
		assert.equal(d.aggressive, false);
	});
	it("aggressive fold at 78%", () => assert.ok(m.decideAfterUsage(790, 1000, false, cfg).aggressive));
	it("exit-with-summary at 80%", () => assert.equal(m.decideAfterUsage(810, 1000, false, cfg).kind, "exit-with-summary"));
	it("already folded returns none", () => assert.equal(m.decideAfterUsage(900, 1000, true, cfg).kind, "none"));
	it("no ctxMax returns none", () => {
		const d = m.decideAfterUsage(100, undefined, false, cfg);
		assert.equal(d.kind, "none");
		assert.equal(d.ctxMax, 0);
	});
});
});

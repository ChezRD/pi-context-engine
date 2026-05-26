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

describe("buildContextStatus", () => {
  it("loads module and functions", async () => {
m.buildContextStatus = (await import("../../../src/cache-engine/decision-engine.ts")).buildContextStatus;
    assert.ok(m.buildContextStatus);
  });

describe("buildContextStatus", () => {
	const getCtx = (ratio, hitRate) => ({ getContextUsage: () => ({ ratio, hitRate }) });
	it("green zone", () => assert.equal(m.buildContextStatus(getCtx(0.30, 0.90), emptyStats, cfg).zone, "green"));
	it("red zone", () => assert.equal(m.buildContextStatus(getCtx(0.75, 0.50), emptyStats, cfg).zone, "red"));
	it("critical zone", () => assert.equal(m.buildContextStatus(getCtx(0.90, 0.50), emptyStats, cfg).zone, "critical"));
	it("no ratio", () => {
		const s = m.buildContextStatus({ getContextUsage: () => null }, emptyStats, cfg);
		assert.equal(s.zone, "green");
		assert.equal(s.ratio, undefined);
	});
});
});

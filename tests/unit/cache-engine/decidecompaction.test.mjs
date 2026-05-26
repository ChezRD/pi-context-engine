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

describe("decideCompaction", () => {
  it("loads module and functions", async () => {
m.decideCompaction = (await import("../../../src/cache-engine/decision-engine.ts")).decideCompaction;
m.readContextUsage = (await import("../../../src/cache-engine/decision-engine.ts")).readContextUsage;
m.zoneForRatio = (await import("../../../src/cache-engine/decision-engine.ts")).zoneForRatio;
    assert.ok(m.decideCompaction);
  });

describe("decideCompaction", () => {
	it("holds when ratio is undefined", () => assert.equal(m.decideCompaction({ ratio: undefined, hitRate: undefined }, cfg), "hold"));
	it("hold when low usage", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0.0 }, cfg), "hold"));
	it("fold at high ratio", () => assert.equal(m.decideCompaction({ ratio: 0.82, hitRate: 0.50 }, cfg), "fold"));
	it("force_fold at critical", () => assert.equal(m.decideCompaction({ ratio: 0.90, hitRate: 0.0 }, cfg), "force_fold"));
	it("fold when ratio above contextCompactPct regardless of hit rate", () => assert.equal(m.decideCompaction({ ratio: 0.71, hitRate: 0.95 }, cfg), "fold"));
	it("hold when ratio below contextCompactPct", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0 }, cfg), "hold"));
	it("folds at the exact 0.75 fallback threshold when hit rate is low", () => assert.equal(m.decideCompaction({ ratio: 0.75, hitRate: 0.2 }, cfg), "fold"));
	it("still folds below the 0.75 fallback threshold once contextCompactPct is already exceeded", () => assert.equal(m.decideCompaction({ ratio: 0.74, hitRate: 0.0 }, cfg), "fold"));
});

describe("readContextUsage", () => {
	it("reads promptTokens and maxTokens", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ promptTokens: 500, maxTokens: 1000 }) }), { ratio: 0.5, tokens: 500, max: 1000 });
	});
	it("reads percent values above one as percentages", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ percent: 75 }) }), { ratio: 0.75, tokens: undefined, max: undefined });
	});
	it("reads pct values already in ratio form", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ pct: 0.55 }) }), { ratio: 0.55, tokens: undefined, max: undefined });
	});
	it("reads usedTokens and limit", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ usedTokens: 200, limit: 1000 }) }), { ratio: 0.2, tokens: 200, max: 1000 });
	});
	it("returns an empty object when getContextUsage throws", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => { throw new Error("boom"); } }), {});
	});
});

describe("zoneForRatio", () => {
	it("maps exact thresholds to the expected zones", () => {
		const thresholds = { ...cfg, contextWarnPct: 0.60, contextDangerPct: 0.72, contextCompactPct: 0.82, contextForceFoldPct: 0.95 };
		assert.equal(m.zoneForRatio(0.60, thresholds), "yellow");
		assert.equal(m.zoneForRatio(0.72, thresholds), "orange");
		assert.equal(m.zoneForRatio(0.82, thresholds), "red");
		assert.equal(m.zoneForRatio(0.95, thresholds), "critical");
	});
	it("defaults undefined ratio to green", () => {
		assert.equal(m.zoneForRatio(undefined, cfg), "green");
	});
});
});

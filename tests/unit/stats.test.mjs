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

describe("stats.ts", () => {
  it("loads module and functions", async () => {
m.hitRatio = (await import("../../src/stats.ts")).hitRatio;
m.formatTokenCount = (await import("../../src/stats.ts")).formatTokenCount;
m.formatRatio = (await import("../../src/stats.ts")).formatRatio;
m.extractUsageSnapshot = (await import("../../src/stats.ts")).extractUsageSnapshot;
m.emptyStats = (await import("../../src/stats.ts")).emptyStats;
m.addUsage = (await import("../../src/stats.ts")).addUsage;
m.savingsFromRealCost = (await import("../../src/stats.ts")).savingsFromRealCost;
m.costToCompact = (await import("../../src/stats.ts")).costToCompact;
m.deepSeekOfficialCost = (await import("../../src/stats.ts")).deepSeekOfficialCost;
    assert.ok(m.hitRatio);
  });

describe("hitRatio", () => {
	it("calculates ratio", () => assert.equal(m.hitRatio(100, 900), 0.9));
	it("handles zero total", () => assert.equal(m.hitRatio(0, 0), undefined));
	it("includes cacheWrite in denominator", () => assert.equal(m.hitRatio(100, 800, 100), 0.8));
});

describe("formatTokenCount", () => {
	it("formats zero", () => assert.equal(m.formatTokenCount(0), "0"));
	it("formats hundreds without suffix", () => assert.equal(m.formatTokenCount(500), "500"));
	it("formats millions", () => assert.equal(m.formatTokenCount(1_500_000), "1.5M"));
	it("formats thousands", () => assert.equal(m.formatTokenCount(1_500), "1.5k"));
	it("formats small numbers", () => assert.equal(m.formatTokenCount(42), "42"));
});

describe("formatRatio", () => {
	it("formats undefined as n/a", () => assert.equal(m.formatRatio(undefined), "n/a"));
	it("formats zero as 0.0%", () => assert.equal(m.formatRatio(0), "0.0%"));
	it("formats fractional ratios with one decimal place", () => assert.equal(m.formatRatio(0.756), "75.6%"));
});

describe("extractUsageSnapshot", () => {
	it("extracts from usage object", () => {
		const s = m.extractUsageSnapshot({ usage: { input: 100, cacheRead: 900, output: 50 } });
		assert.equal(s.input, 100);
		assert.equal(s.cacheRead, 900);
	});
	it("accepts cache-only usage and returns hitRate 1", () => {
		const s = m.extractUsageSnapshot({ usage: { input: 0, cacheRead: 50, cacheWrite: 0, output: 0 } });
		assert.equal(s.cacheRead, 50);
		assert.equal(s.hitRate, 1);
	});
	it("prefers top-level usage over nested message.usage and reads cost.total plus request id", () => {
		const s = m.extractUsageSnapshot({
			id: "req-1",
			usage: { input: 10, cacheRead: 90, cacheWrite: 0, output: 5, cost: { total: 0.123 } },
			message: { usage: { input: 999, cacheRead: 0, cacheWrite: 0, output: 0 } },
		});
		assert.equal(s.input, 10);
		assert.equal(s.cost, 0.123);
		assert.equal(s.requestId, "req-1");
	});
	it("preserves finite negative numbers as-is and ignores usage arrays", () => {
		assert.equal(m.extractUsageSnapshot({ usage: { input: -5, cacheRead: 10, cacheWrite: 0, output: 0 } }).input, -5);
		assert.equal(m.extractUsageSnapshot({ usage: [] }), undefined);
	});
	it("returns undefined for no usage", () => assert.equal(m.extractUsageSnapshot({}), undefined));
	it("returns undefined for null", () => assert.equal(m.extractUsageSnapshot(null), undefined));
});

describe("addUsage", () => {
	it("adds snapshot to stats", () => {
		const stats = m.emptyStats();
		const r = m.addUsage(stats, { input: 100, cacheRead: 900, output: 50, cacheWrite: 0 }, "deepseek/deepseek-v4-flash");
		assert.equal(r.requests, 1);
		assert.equal(r.input, 100);
		assert.equal(r.cacheRead, 900);
	});
	it("handles undefined snapshot", () => {
		const stats = m.emptyStats();
		assert.equal(m.addUsage(stats, undefined), stats);
	});
	it("uses snapshot modelCost and explicit snapshot cost when present", () => {
		const stats = m.emptyStats();
		const result = m.addUsage(stats, {
			input: 100,
			cacheRead: 0,
			cacheWrite: 0,
			output: 10,
			cost: 0.5,
			modelId: "unknown-model",
			modelCost: { input: 1, cacheRead: 0.1, cacheWrite: 0, output: 2 },
		});
		assert.equal(result.cost, 0.5);
		assert.equal(result.last.actualCost, 0.5);
		assert.equal(result.last.modelId, "unknown-model");
	});
	it("handles stats without compacts array", () => {
		const result = m.addUsage({ ...m.emptyStats(), compacts: undefined }, { input: 1, cacheRead: 0, cacheWrite: 0, output: 0 });
		assert.deepEqual(result.compacts, []);
	});
});

describe("savingsFromRealCost", () => {
	it("calculates savings", () => {
		const s = m.savingsFromRealCost({ input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, cost: 0.00016 }, { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(typeof s === "number");
	});
});

describe("costToCompact", () => {
	it("returns 0 for undefined usage", () => {
		const cost = m.costToCompact(undefined, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.equal(cost, 0);
	});
	it("calculates cost", () => {
		const cost = m.costToCompact({ input: 1000, cacheRead: 900, cacheWrite: 100 }, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(cost > 0);
	});
	it("returns zero without pricing and computes positive delta even for fully cached input", () => {
		assert.equal(m.costToCompact({ input: 1000, cacheRead: 1000, cacheWrite: 0 }, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 }), 0.0001372);
		assert.equal(m.costToCompact({ input: 1000, cacheRead: 0, cacheWrite: 0 }, undefined), 0);
	});
});

describe("deepSeekOfficialCost", () => {
	it("returns flash pricing", () => {
		const p = m.deepSeekOfficialCost("deepseek-v4-flash");
		assert.equal(p.input, 0.14);
	});
	it("returns pro pricing", () => {
		const cost = m.deepSeekOfficialCost("deepseek-pro");
		assert.strictEqual(cost.input, 0.435);
	});
	it("treats chat, reasoner, and case-insensitive deepseek ids as flash pricing", () => {
		assert.equal(m.deepSeekOfficialCost("deepseek-chat").input, 0.14);
		assert.equal(m.deepSeekOfficialCost("deepseek-reasoner").input, 0.14);
		assert.equal(m.deepSeekOfficialCost("DeepSeek-V4-Flash").input, 0.14);
	});
	it("returns undefined for unknown", () => assert.equal(m.deepSeekOfficialCost("gpt-4"), undefined));
});

describe("emptyStats", () => {
	it("returns zeroed stats", () => {
		const s = m.emptyStats();
		assert.equal(s.requests, 0);
		assert.equal(s.cacheRead, 0);
	});
});
});

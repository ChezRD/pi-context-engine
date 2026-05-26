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

describe("indexer", () => {
  it("loads module and functions", async () => {
m.createToolCallIndexer = (await import("../../../src/projection/indexer.ts")).createToolCallIndexer;
    assert.ok(m.createToolCallIndexer);
  });

describe("ToolCallIndexer", () => {
	it("starts empty", () => assert.equal(m.createToolCallIndexer().getAllSummarized().length, 0));
	it("records and checks", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read_file", 0);
		assert.ok(idx.isSummarized("tc-1"));
		assert.equal(idx.isSummarized("tc-2"), false);
	});
	it("getRecord", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		assert.equal(idx.getRecord("tc-1").toolName, "read");
	});
	it("resets", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		idx.reset();
		assert.equal(idx.getAllSummarized().length, 0);
	});
});
});

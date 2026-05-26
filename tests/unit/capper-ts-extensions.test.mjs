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

describe("capper.ts extensions", () => {
  it("loads module and functions", async () => {
m.extractToolResultText = (await import("../../src/capper.ts")).extractToolResultText;
m.HugeResultStore = (await import("../../src/capper.ts")).HugeResultStore;
m.buildPreview = (await import("../../src/capper.ts")).buildPreview;
    assert.ok(m.extractToolResultText);
  });

describe("extractToolResultText", () => {
	it("returns string as-is", () => assert.equal(m.extractToolResultText("hello"), "hello"));
	it("extracts from ContentPart[]", () => assert.equal(m.extractToolResultText([{ type: "text", text: "hello" }]), "hello"));
	it("returns undefined for non-array", () => assert.equal(m.extractToolResultText(42), undefined));
	it("handles empty array", () => assert.equal(m.extractToolResultText([]), undefined));
});

describe("buildPreview", () => {
	it("builds preview string", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("x".repeat(200), "t1", "read");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 20 });
		assert.ok(prev.includes('"ref":'));
		assert.ok(prev.includes("<model_visible_context"));
		assert.ok(prev.includes('kind="context_result_truncated"'));
		assert.ok(prev.includes("huge_result_preview"));
		assert.ok(!prev.includes('"tool": "context_result_lookup"'));
		assert.ok(prev.includes("read"));
	});
	it("handles empty tail", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("short", "t2");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 0 });
		assert.ok(prev.includes("short"));
	});
});
});

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

describe("model.ts", () => {
  it("loads module and functions", async () => {
m.detectDeepSeekModel = (await import("../../src/model.ts")).detectDeepSeekModel;
m.isDeepSeekDetectionActive = (await import("../../src/model.ts")).isDeepSeekDetectionActive;
    assert.ok(m.detectDeepSeekModel);
  });

describe("detectDeepSeekModel", () => {
	it("detects native DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek/deepseek-v4-flash", provider: "deepseek", compat: { thinkingFormat: "deepseek" } });
		assert.equal(d.kind, "native");
	});
	it("detects compatible model", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek-chat", provider: "openrouter" });
		assert.equal(d.kind, "misconfigured");
	});
	it("detects non-DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "gpt-4", provider: "openai" });
		assert.equal(d.kind, "not-deepseek");
	});
	it("handles undefined model", () => {
		const d = m.detectDeepSeekModel(undefined);
		assert.equal(d.kind, "not-deepseek");
	});

	it("native deepseek with requiresReasoning and correct thinkingLevelMap suppresses warnings", () => {
		const d = m.detectDeepSeekModel({
			id: "deepseek/deepseek-v4-flash",
			provider: "deepseek",
			reasoning: true,
			thinkingLevelMap: { high: "high", xhigh: "max" },
			compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
		});
		assert.equal(d.kind, "native");
		assert.equal(d.ok, true);
	});

	it("native deepseek with no warnings when reasoning conditions are not met", () => {
		const d = m.detectDeepSeekModel({
			id: "deepseek-chat",
			provider: "deepseek",
			compat: { thinkingFormat: "deepseek" },
		});
		assert.equal(d.kind, "native");
		assert.equal(d.ok, true);
	});

	it("native deepseek warns when thinkingLevelMap has wrong values", () => {
		const d = m.detectDeepSeekModel({
			id: "deepseek/deepseek-v4-flash",
			provider: "deepseek",
			thinkingLevelMap: { high: "low", xhigh: "medium" },
			compat: { thinkingFormat: "deepseek" },
		});
		assert.equal(d.kind, "native");
		assert.equal(d.ok, false);
	});

	it("isDeepSeekDetectionActive returns true for active kinds", () => {
		assert.equal(m.isDeepSeekDetectionActive({ kind: "native", ok: true, warnings: [], modelId: "x", provider: "y" }), true);
		assert.equal(m.isDeepSeekDetectionActive({ kind: "compatible", ok: false, warnings: [], modelId: "x", provider: "y" }), true);
		assert.equal(m.isDeepSeekDetectionActive({ kind: "misconfigured", ok: false, warnings: [], modelId: "x", provider: "y" }), true);
		assert.equal(m.isDeepSeekDetectionActive({ kind: "not-deepseek", ok: true, warnings: [], modelId: "x", provider: "y" }), false);
	});

	it("compatible warns when thinkingFormat is not deepseek but mentions DeepSeek", () => {
		const d = m.detectDeepSeekModel({
			id: "deepseek-chat",
			provider: "openrouter",
			compat: { thinkingFormat: "claude" },
		});
		assert.equal(d.kind, "misconfigured");
		assert.equal(d.ok, false);
	});

	it("misconfigured warns about reasoning content when reasoner mentioned", () => {
		const d = m.detectDeepSeekModel({
			id: "deepseek-reasoner",
			provider: "openrouter",
			reasoning: true,
			compat: { thinkingFormat: "other" },
		});
		assert.equal(d.kind, "misconfigured");
		assert.equal(d.warnings.length, 2);
	});

	it("uses model name and empty compat fallback paths", () => {
		const d = m.detectDeepSeekModel({
			name: "deepseek-v4",
			provider: "openrouter",
			compat: null,
		});
		assert.equal(d.kind, "misconfigured");
		assert.equal(d.modelId, undefined);
	});

	it("detects deepseek-compatible thinking format from non-native provider", () => {
		const d = m.detectDeepSeekModel({
			id: "not-deepseek",
			provider: "openrouter",
			compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
		});
		assert.equal(d.kind, "compatible");
		assert.equal(d.ok, true);
	});
});
});

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

describe("countMessageTokens", () => {
  it("loads module and functions", async () => {
m.countMessageTokens = (await import("../../../src/projection/history-folder.ts")).countMessageTokens;
    assert.ok(m.countMessageTokens);
  });

describe("countMessageTokens", () => {
	it("counts string content", () => assert.ok(m.countMessageTokens({ role: "user", content: "hello world" }) > 0));
	it("counts ContentPart[]", () => assert.ok(m.countMessageTokens({ role: "user", content: [{ type: "text", text: "hello" }] }) > 0));
	it("counts tool_calls JSON", () => assert.ok(m.countMessageTokens({ role: "assistant", content: "", tool_calls: [{ function: { name: "read_file", arguments: '{"path":"x"}' } }] }) > 0));
	it("handles null", () => assert.equal(m.countMessageTokens(null), 0));
	it("handles undefined", () => assert.equal(m.countMessageTokens(undefined), 0));
	it("handles empty content", () => assert.equal(m.countMessageTokens({ role: "user", content: "" }), 1));
	it("handles simple content", () => assert.ok(m.countMessageTokens({ role: "user", content: "x" }) > 0));
});
});

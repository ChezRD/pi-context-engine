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

describe("trimTrailingAssistantToolCalls", () => {
  it("loads module and functions", async () => {
m.trimTrailingAssistantToolCalls = (await import("../../../src/projection/history-folder.ts")).trimTrailingAssistantToolCalls;
    assert.ok(m.trimTrailingAssistantToolCalls);
  });

describe("trimTrailingAssistantToolCalls", () => {
	it("drops trailing assistant with tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant", tool_calls: [{ function: { name: "test" } }] },
		]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 1);
	});
	it("keeps user messages", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([{ role: "user", content: "hi" }]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 0);
	});
	it("handles empty", () => assert.equal(m.trimTrailingAssistantToolCalls([])[0].length, 0));
	it("keeps assistant with no content and no tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant" },
		]);
		assert.equal(msgs.length, 2);
		assert.equal(n, 0);
	});
});
});

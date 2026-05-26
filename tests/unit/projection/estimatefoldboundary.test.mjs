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

describe("estimateFoldBoundary", () => {
  it("loads module and functions", async () => {
m.estimateFoldBoundary = (await import("../../../src/projection/history-folder.ts")).estimateFoldBoundary;
    assert.ok(m.estimateFoldBoundary);
  });

describe("estimateFoldBoundary", () => {
	it("returns ok:false for empty messages", () => {
		const r = m.estimateFoldBoundary([], 0, 100);
		assert.equal(r.ok, false);
		assert.equal(r.reasonKey, "engine.fold.reason.noMessages");
	});
	it("splits messages into head and tail", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		// Each msg ~2 tokens. TailBudget=2 means only 0-1 msgs in tail.
		// user-seeking expands tail to include last user message.
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.ok(r.headMessages.length > 0);
		assert.equal(r.tailMessages.length, 2);
		assert.equal(r.tailMessages[0].role, "user");
		assert.equal(r.tailMessages[0].content, "u2");
	});
	it("handles non-array input", () => {
		const r = m.estimateFoldBoundary(undefined, 0, 100);
		assert.equal(r.ok, false);
	});
	it("user-seeking expands tail to user boundary", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1 very long message to break tail" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.equal(r.headMessages.length, 3);
		assert.equal(r.tailMessages.length, 2);
		assert.equal(r.tailMessages[0].role, "user");
		assert.equal(r.tailMessages[0].content, "u2");
	});
	it("returns the whole conversation as tail when it fits the budget", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 100);
		assert.equal(r.ok, true);
		assert.equal(r.headMessages.length, 0);
		assert.deepEqual(r.tailMessages, msgs);
	});
	it("keeps the original boundary when user-seeking would exceed the expanded budget", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1 " + "x".repeat(200) },
			{ role: "assistant", content: "a1 " + "y".repeat(80) },
			{ role: "assistant", content: "a2" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.equal(r.tailMessages.length, 1);
		assert.equal(r.tailMessages[0].role, "assistant");
		assert.equal(r.headMessages.length, 3);
	});
});
});

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

describe("pruneMessages", () => {
  it("loads module and functions", async () => {
m.createToolCallIndexer = (await import("../../../src/projection/indexer.ts")).createToolCallIndexer;
m.pruneMessages = (await import("../../../src/projection/pruner.ts")).pruneMessages;
    assert.ok(m.createToolCallIndexer);
  });

describe("pruneMessages", () => {
	it("removes summarized tool results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "big result" },
		], idx);
		assert.equal(pruned.length, 1);
	});
	it("keeps unsummarized tool results", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([{ role: "user", content: "hi" }, { role: "tool", toolCallId: "tc-new", content: "result" }], idx).length, 2);
	});
	it("deduplicates summary injection while removing raw results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "summary");
		idx.markSummarized("tc-2", "rg", 0, "summary");
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
			{ role: "tool", toolCallId: "tc-1", content: "result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "result 2" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].role, "custom");
		const summaryText = pruned[0].content[0].text;
		assert.match(summaryText, /^<context-engine-summary>/);
		assert.match(summaryText, /Summary of pruned tool-call batch/);
		assert.match(summaryText, /Coverage: complete/);
	});
	it("handles empty messages", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([], idx).length, 0);
	});
	it("removes trailing orphan tool after pruning", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "result" },
			{ role: "tool", toolCallId: "tc-orphan", content: "no assistant" },
		], idx);
		assert.equal(pruned.length, 1); // orphan tool only
	});

	it("keeps assistant message when no tool calls are summarized", () => {
		const idx = m.createToolCallIndexer();
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "I'll look that up", tool_calls: [{ id: "tc-new", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-new", content: "result" },
		], idx);
		assert.equal(pruned.length, 3); // all kept as-is
		assert.equal(pruned[1].role, "assistant");
	});

	it("keeps summarized tool calls even when summary text is missing and clears remaining calls", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0); // no summaryText
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "result" },
		], idx);
		assert.equal(pruned.length, 1); // only user message kept
		assert.equal(pruned[0].role, "user");
	});

	it("filterRemainingToolCalls returns null when all calls hidden and no text content", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		idx.markSummarized("tc-2", "write", 0);
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }, { id: "tc-2", function: { name: "write", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "result 2" },
		], idx);
		assert.equal(pruned.length, 1); // only user message — filterRemainingToolCalls returns null
		assert.equal(pruned[0].role, "user");
	});

	it("passes through tool role message without toolCallId", () => {
		const idx = m.createToolCallIndexer();
		const pruned = m.pruneMessages([
			{ role: "tool", content: "orphan result" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].content, "orphan result");
	});

	it("extractToolCalls handles null/undefined ids in tool_calls array and content parts", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "some summary");
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }, { id: null }, { bogus: true }] },
			{ role: "tool", toolCallId: "tc-1", content: "result" },
		], idx);
		// null/bogus ids are filtered out
		assert.ok(pruned.length > 0);
	});

	it("pruneMessages handles assistant with content-based toolCall parts", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-3", "read", 0, "summary");
		const pruned = m.pruneMessages([
			{ role: "assistant", content: [{ type: "toolCall", id: "tc-3" }] },
			{ role: "tool", toolCallId: "tc-3", content: "result" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].role, "custom");
	});

	it("filterRemainingToolCalls preserves unchanged messages", () => {
		const idx = m.createToolCallIndexer();
		const msg = { role: "assistant", content: "hello", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] };
		const pruned = m.pruneMessages([msg], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0], msg); // original reference kept
	});

	it("filterRemainingToolCalls returns null when only content-based tool calls are hidden with no remaining text", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-x", "read", 0);
		idx.markSummarized("tc-y", "rg", 0);
		const pruned = m.pruneMessages([
			{ role: "assistant", content: [{ type: "toolCall", id: "tc-x" }, { type: "toolCall", id: "tc-y" }] },
			{ role: "tool", toolCallId: "tc-x", content: "result" },
			{ role: "tool", toolCallId: "tc-y", content: "result y" },
		], idx);
		// both hidden, no summary text, no remaining text → filterRemainingToolCalls returns null
		assert.equal(pruned.length, 0);
	});
});
});

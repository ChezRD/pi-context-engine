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

describe("captureBatches", () => {
  it("loads module and functions", async () => {
m.captureBatches = (await import("../../../src/projection/batch-capture.ts")).captureBatches;
m.extractMessageContext = (await import("../../../src/projection/batch-capture.ts")).extractMessageContext;
m.extractAssistantToolCalls = (await import("../../../src/projection/batch-capture.ts")).extractAssistantToolCalls;
m.captureTurnEndBatch = (await import("../../../src/projection/batch-capture.ts")).captureTurnEndBatch;
    assert.ok(m.captureBatches);
  });

describe("captureBatches", () => {
	it("captures toolCall+toolResult pairs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "user", content: "hi" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "result");
	});
	it("skips summarized IDs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("handles empty branch", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("captures tool calls using function name as fallback id", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "toolResult", toolCallId: "read", content: "ok" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
	});
	it("keeps delayed parallel tool results across intermediate assistant text", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", content: [{ type: "toolCall", id: "tc-1", name: "read", arguments: { path: "a.ts" } }, { type: "toolCall", id: "tc-2", name: "read", arguments: { path: "b.ts" } }] }, turnIndex: 0 },
			{ message: { role: "toolResult", toolCallId: "tc-1", content: "a" }, turnIndex: 0 },
			{ message: { role: "assistant", content: "intermediate analysis" }, turnIndex: 0 },
			{ message: { role: "toolResult", tool_call_id: "tc-2", content: "b" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => [tc.id, tc.result]), [["tc-1", "a"], ["tc-2", "b"]]);
	});
	it("splits multi-turn tool episodes when the dialogue gap reaches bridge length", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "user", content: "next step" }, turnIndex: 1 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0, { bridgeLength: 1 });
		assert.equal(pr.pendingBatches.length, 2);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.deepEqual(pr.pendingBatches[1].toolCalls.map((tc) => tc.id), ["tc-2"]);
	});
	it("merges multi-turn tool episodes when the dialogue gap is inside bridge length", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "user", content: "next step" }, turnIndex: 1 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0, { bridgeLength: 2 });
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1", "tc-2"]);
	});
});

describe("batch-capture helpers", () => {
	it("extractMessageContext collects reasoning, thinking, and text parts", () => {
		const text = m.extractMessageContext({
			reasoningContent: "reasoning",
			reasoning_content: "snake reasoning",
			thinking: "thought",
			content: [
				{ type: "text", text: "visible" },
				{ type: "reasoning", text: "reasoning part" },
				{ type: "thinking", thinking: "thinking field" },
				{ type: "reasoning_content", reasoning_content: "reasoning content field" },
				{ type: "image_url", image_url: { url: "ignored" } },
			],
		});
		assert.match(text, /reasoning/);
		assert.match(text, /snake reasoning/);
		assert.match(text, /thought/);
		assert.match(text, /visible/);
		assert.match(text, /reasoning part/);
		assert.match(text, /thinking field/);
		assert.match(text, /reasoning content field/);
		assert.doesNotMatch(text, /ignored/);
	});

	it("extractMessageContext truncates long content to the context cap", () => {
		const text = m.extractMessageContext({ content: "x".repeat(1000) });
		assert.equal(text.length, 600);
	});

	it("extractMessageContext returns undefined for empty and null messages", () => {
		assert.equal(m.extractMessageContext(null), undefined);
		assert.equal(m.extractMessageContext({ content: [{ type: "image_url", image_url: { url: "ignored" } }] }), undefined);
	});

	it("extractAssistantToolCalls supports camelCase and content-part formats", () => {
		assert.deepEqual(
			m.extractAssistantToolCalls({ toolCalls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }),
			[{ id: "tc-1", name: "read", args: "{}" }],
		);
		assert.deepEqual(
			m.extractAssistantToolCalls({ content: [{ type: "tool_use", id: "tc-2", name: "grep", input: { pattern: "x" } }] }),
			[{ id: "tc-2", name: "grep", args: "{\"pattern\":\"x\"}" }],
		);
	});

	it("extractAssistantToolCalls handles fallback ids, structured arguments, and numeric ids", () => {
		assert.deepEqual(
			m.extractAssistantToolCalls({
				tool_calls: [
					{ id: 42, function: { name: "read", arguments: { path: "a.ts" } } },
					{ callId: "call-2", toolName: "context_result_lookup", input: { ref: "dsc-1" } },
					{ function: { name: "fallback_name" } },
				],
			}),
			[
				{ id: "42", name: "read", args: "{\"path\":\"a.ts\"}" },
				{ id: "call-2", name: "context_result_lookup", args: "{\"ref\":\"dsc-1\"}" },
				{ id: "fallback_name", name: "fallback_name", args: undefined },
			],
		);
	});

	it("extractAssistantToolCalls returns an empty array when no tool calls exist", () => {
		assert.deepEqual(m.extractAssistantToolCalls({ role: "assistant", content: "plain" }), []);
		assert.deepEqual(m.extractAssistantToolCalls({ role: "assistant", tool_calls: [] }), []);
	});
});

describe("captureTurnEndBatch", () => {
	it("returns zero when there are no assistant tool calls or no results", () => {
		const pr = { pendingBatches: [] };
		assert.equal(m.captureTurnEndBatch({ message: { role: "assistant", content: "plain" }, toolResults: [] }, [], pr, 1), 0);
		assert.equal(m.captureTurnEndBatch({ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, toolResults: [] }, [], pr, 1), 0);
		assert.equal(pr.pendingBatches.length, 0);
	});

	it("captures matching results, call context, and skips mismatched or skipped ids", () => {
		const pr = { pendingBatches: [] };
		const count = m.captureTurnEndBatch({
			message: {
				role: "assistant",
				content: "I will inspect the file",
				tool_calls: [
					{ id: "skip-me", function: { name: "read", arguments: "{\"path\":\"skip.ts\"}" } },
					{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"a.ts\"}" } },
					{ id: "tc-2", function: { name: "bash", arguments: "{\"cmd\":\"echo\"}" } },
				],
			},
			toolResults: [
				{ toolCallId: "tc-1", content: [{ type: "text", text: "file text" }] },
				{ toolCallId: "other", content: "ignored" },
			],
		}, ["skip-me"], pr, 9);

		assert.equal(count, 1);
		assert.equal(pr.pendingBatches.length, 1);
		assert.equal(pr.pendingBatches[0].context, "I will inspect the file");
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "file text");
	});

	it("formats result, lookup details, missing ids, and JSON fallback through captured results", () => {
		const pr = { pendingBatches: [] };
		m.captureTurnEndBatch({
			message: {
				role: "assistant",
				tool_calls: [
					{ id: "lookup", function: { name: "context_result_lookup", arguments: "{}" } },
					{ id: "details", function: { name: "custom", arguments: "{}" } },
					{ id: "result-prop", function: { name: "custom", arguments: "{}" } },
					{ id: "json-fallback", function: { name: "custom", arguments: "{}" } },
					{ id: "missing-result-id", function: { name: "custom", arguments: "{}" } },
				],
			},
			toolResults: [
				{ callId: "lookup", toolName: "context_result_lookup", details: { ref: "dsc-1", offset: 5, limit: 10, returnedChars: 3, bytes: 100, found: true } },
				{ tool_call_id: "details", toolName: "custom_tool", details: { ref: "abc", found: false } },
				{ id: "result-prop", result: "result field" },
				{ toolCallId: "json-fallback", value: 123 },
				{ content: "no id" },
			],
		}, [], pr, 3);

		assert.equal(pr.pendingBatches.length, 1);
		const byId = Object.fromEntries(pr.pendingBatches[0].toolCalls.map((tc) => [tc.id, tc.result]));
		assert.equal(byId.lookup, "[context_result_lookup ref=dsc-1 offset=5 limit=10 returned=3 bytes=100 found=true]");
		assert.equal(byId.details, "[custom_tool ref=abc found=false]");
		assert.equal(byId["result-prop"], "result field");
		assert.match(byId["json-fallback"], /"value":123/);
		assert.equal("missing-result-id" in byId, false);
	});
	it("captures turn_end arrays and single toolResult events with alternate ids", () => {
		const pr = { pendingBatches: [] };
		const count = m.captureTurnEndBatch({
			message: { role: "assistant", content: [{ type: "function_call", call_id: "call-1", name: "read", arguments: { path: "a.ts" } }] },
			toolResult: { call_id: "call-1", content: "single result" },
		}, [], pr, 4);
		assert.equal(count, 1);
		assert.equal(pr.pendingBatches[0].toolCalls[0].id, "call-1");
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "single result");
	});

	it("deduplicates against existing pending batches and skips empty results", () => {
		const pr = { pendingBatches: [{ turnIndex: 1, toolCalls: [{ id: "tc-1", name: "read", turnIndex: 1, result: "old" }] }] };
		const count = m.captureTurnEndBatch({
			message: { role: "assistant", tool_calls: [
				{ id: "tc-1", function: { name: "read" } },
				{ id: "tc-2", function: { name: "read" } },
				{ id: "tc-3", function: { name: "read" } },
			] },
			toolResults: [
				{ toolCallId: "tc-1", content: "new" },
				{ toolCallId: "tc-2", content: "   " },
				{ toolCallId: "tc-3", content: "fresh" },
			],
		}, [], pr, 2);
		assert.equal(count, 1);
		assert.equal(pr.pendingBatches.length, 2);
		assert.deepEqual(pr.pendingBatches[1].toolCalls.map((tc) => tc.id), ["tc-3"]);
	});
});
});

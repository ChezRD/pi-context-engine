import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let buildSessionContentMap, validateSessionPruneSuggestion;
before(async () => {
	const mod = await import("../../../src/projection/session-map.ts");
	buildSessionContentMap = mod.buildSessionContentMap;
	validateSessionPruneSuggestion = mod.validateSessionPruneSuggestion;
});

function mockState(overrides = {}) {
	return {
		toolIndexer: {
			isSummarized: () => false,
		},
		...overrides,
	};
}

describe("buildSessionContentMap", () => {
	it("returns empty map for undefined branch", () => {
		const map = buildSessionContentMap(undefined, mockState());
		assert.equal(map.nodes.length, 0);
		assert.equal(map.segments.length, 0);
		assert.equal(map.totals.messages, 0);
	});

	it("returns empty map for empty branch", () => {
		const map = buildSessionContentMap([], mockState());
		assert.equal(map.nodes.length, 0);
	});

	it("captures user message node", () => {
		const map = buildSessionContentMap(
			[{ type: "message", message: { role: "user", content: "hello" }, turnIndex: 1 }],
			mockState(),
		);
		const messages = map.nodes.filter((n) => n.kind === "message");
		assert.equal(messages.length, 1);
		assert.equal(messages[0].role, "user");
		assert.equal(messages[0].turnIndex, 1);
	});

	it("captures assistant message with tool calls", () => {
		const map = buildSessionContentMap(
			[{
				type: "message",
				message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				turnIndex: 2,
			}],
			mockState(),
		);
		const calls = map.nodes.filter((n) => n.kind === "tool-call");
		assert.equal(calls.length, 1);
		assert.equal(calls[0].toolName, "read");
	});

	it("captures tool result node", () => {
		const map = buildSessionContentMap(
			[{
				type: "message",
				message: { role: "toolResult", toolCallId: "tc1", content: "result data", toolName: "read" },
				turnIndex: 2,
			}],
			mockState(),
		);
		const results = map.nodes.filter((n) => n.kind === "tool-result");
		assert.equal(results.length, 1);
		assert.equal(results[0].toolCallId, "tc1");
	});

	it("extracts text from array content for tool result hashes", () => {
		const map = buildSessionContentMap(
			[{
				type: "message",
				message: {
					role: "tool",
					tool_call_id: "tc-array",
					content: [{ type: "text", text: "first line" }, "second line"],
					toolName: "read",
				},
				turnIndex: 2,
			}],
			mockState(),
		);
		const result = map.nodes.find((n) => n.kind === "tool-result");
		assert.ok(result.resultHash);
		assert.equal(result.textPreview, "first line second line");
	});

	it("ignores non-text array parts in session content text", () => {
		const map = buildSessionContentMap(
			[{
				type: "message",
				message: {
					role: "tool",
					tool_call_id: "tc-mixed",
					content: [{ type: "image", data: "x" }, { type: "text", text: "visible result" }],
					toolName: "read",
				},
				turnIndex: 2,
			}],
			mockState(),
		);
		const result = map.nodes.find((n) => n.kind === "tool-result");
		assert.equal(result.textPreview, "visible result");
	});

	it("tracks totals correctly", () => {
		const map = buildSessionContentMap(
			[
				{ type: "message", message: { role: "user", content: "hi" }, turnIndex: 1 },
				{ type: "message", message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 2 },
				{ type: "message", message: { role: "toolResult", toolCallId: "tc1", content: "data", toolName: "read" }, turnIndex: 2 },
			],
			mockState(),
		);
		// assistant with tool_calls also creates a message node
		assert.equal(map.totals.messages, 2);
		assert.equal(map.totals.toolCalls, 1);
		assert.equal(map.totals.toolResults, 1);
	});

	it("handles context-engine-prune-summary custom entries", () => {
		const map = buildSessionContentMap(
			[{
				type: "custom_message",
				customType: "context-engine-prune-summary",
				content: "summary text",
				turnIndex: 1,
			}],
			mockState(),
		);
		const summaries = map.nodes.filter((n) => n.kind === "summary");
		assert.equal(summaries.length, 1);
	});

	it("marks tool calls as summarized when toolIndexer says so", () => {
		const state = {
			toolIndexer: {
				isSummarized: (id) => id === "tc1",
			},
		};
		const map = buildSessionContentMap(
			[{
				type: "message",
				message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				turnIndex: 2,
			}],
			state,
		);
		const call = map.nodes.find((n) => n.kind === "tool-call");
		assert.ok(call);
		assert.equal(call.summarized, true);
		assert.equal(call.dropCandidate, true);
	});
});

describe("validateSessionPruneSuggestion", () => {
	it("rejects non-drop-candidate segments", () => {
		const map = buildSessionContentMap(
			[{ type: "custom_message", customType: "context-engine-prune-summary", content: "old summary", turnIndex: 1 }],
			mockState(),
		);
		const segment = map.segments[0];
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: [segment.id] });
		assert.equal(result.acceptedSegmentIds.length, 0);
		assert.equal(result.rejected.length, 1);
		assert.equal(result.rejected[0].reason, "current-tail");
	});

	it("rejects unknown segment ids", () => {
		const map = buildSessionContentMap([], mockState());
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: ["nonexistent"] });
		assert.equal(result.acceptedSegmentIds.length, 0);
		assert.equal(result.rejected.length, 1);
		assert.equal(result.rejected[0].reason, "unknown-segment");
	});

	it("rejects segments containing user messages", () => {
		const map = buildSessionContentMap(
			[{ type: "message", message: { role: "user", content: "hi" }, turnIndex: 1 }],
			mockState(),
		);
		const segment = map.segments[0];
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: [segment.id] });
		assert.equal(result.acceptedSegmentIds.length, 0);
		assert.equal(result.rejected[0].reason, "contains-user-message");
	});

	it("rejects old segments with pending tool calls", () => {
		const map = buildSessionContentMap(
			[
				{ type: "message", message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 1 },
				{ type: "message", message: { role: "assistant", content: "Current reply." }, turnIndex: 2 },
			],
			mockState(),
		);
		const segment = map.segments.find((s) => s.kind === "tool-batch");
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: [segment.id] });
		assert.equal(result.rejected[0].reason, "pending-tool-call");
	});

	it("rejects old segments that are not drop candidates", () => {
		const map = buildSessionContentMap(
			[
				{ type: "custom_message", customType: "context-engine-prune-summary", content: "old summary", turnIndex: 1 },
				{ type: "message", message: { role: "assistant", content: "Current reply." }, turnIndex: 2 },
			],
			mockState(),
		);
		const segment = map.segments.find((s) => s.kind === "summary");
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: [segment.id] });
		assert.equal(result.rejected[0].reason, "not-drop-candidate");
	});

	it("accepts old summarized drop-candidate segments", () => {
		const map = buildSessionContentMap(
			[
				{ type: "message", message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 1 },
				{ type: "message", message: { role: "tool", tool_call_id: "tc1", content: "old result", toolName: "read" }, turnIndex: 1 },
				{ type: "message", message: { role: "assistant", content: "Current reply." }, turnIndex: 2 },
			],
			mockState({ toolIndexer: { isSummarized: (id) => id === "tc1" } }),
		);
		const segment = map.segments.find((s) => s.kind === "tool-batch");
		const result = validateSessionPruneSuggestion(map, { dropSegmentIds: [segment.id] });
		assert.deepEqual(result.acceptedSegmentIds, [segment.id]);
		assert.deepEqual(result.rejected, []);
	});

	it("handles content with raw string parts in arrays", () => {
		const map = buildSessionContentMap(
			[{ type: "message", message: { role: "user", content: ["raw string", { type: "text", text: "object part" }] }, turnIndex: 1 }],
			mockState(),
		);
		const node = map.nodes.find((n) => n.kind === "message");
		assert.ok(node);
		assert.ok(node.textPreview?.length > 0);
	});
});

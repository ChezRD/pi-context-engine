import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let extractMessageContext, extractAssistantToolCalls, hasAssistantToolCalls, captureTurnEndBatch, captureBatches, shouldTriggerPrune;
before(async () => {
	const mod = await import("../../../src/projection/batch-capture.ts");
	extractMessageContext = mod.extractMessageContext;
	extractAssistantToolCalls = mod.extractAssistantToolCalls;
	hasAssistantToolCalls = mod.hasAssistantToolCalls;
	captureTurnEndBatch = mod.captureTurnEndBatch;
	captureBatches = mod.captureBatches;
	shouldTriggerPrune = mod.shouldTriggerPrune;
});

describe("extractMessageContext", () => {
	it("extracts reasoningContent", () => {
		const result = extractMessageContext({ reasoningContent: "think step by step" });
		assert.ok(result && result.includes("think step by step"));
	});
	it("extracts thinking", () => {
		const result = extractMessageContext({ thinking: "deep thought" });
		assert.ok(result && result.includes("deep thought"));
	});
	it("extracts text content from array", () => {
		const result = extractMessageContext({ content: [{ type: "text", text: "hello" }] });
		assert.equal(result, "hello");
	});
	it("extracts thinking type from content array", () => {
		const result = extractMessageContext({ content: [{ type: "thinking", text: "thinking..." }] });
		assert.equal(result, "thinking...");
	});
	it("truncates to 600 chars", () => {
		const long = "a".repeat(1000);
		const result = extractMessageContext({ content: long });
		assert.ok(result);
		assert.ok(result.length <= 600);
	});
	it("returns undefined for empty content", () => {
		assert.equal(extractMessageContext({}), undefined);
		assert.equal(extractMessageContext(null), undefined);
		assert.equal(extractMessageContext(undefined), undefined);
	});
});

describe("extractAssistantToolCalls", () => {
	it("extracts from tool_calls array", () => {
		const result = extractAssistantToolCalls({
			role: "assistant",
			tool_calls: [{ id: "tc1", function: { name: "read", arguments: '{"path":"x"}' } }],
		});
		assert.equal(result.length, 1);
		assert.equal(result[0].id, "tc1");
		assert.equal(result[0].name, "read");
	});
	it("extracts from toolCalls array", () => {
		const result = extractAssistantToolCalls({
			role: "assistant",
			toolCalls: [{ id: "tc2", name: "bash", args: "ls" }],
		});
		assert.equal(result[0].name, "bash");
	});
	it("extracts from content array with toolCall type", () => {
		const result = extractAssistantToolCalls({
			content: [{ type: "toolCall", id: "tc3", function: { name: "grep" } }],
		});
		assert.equal(result[0].name, "grep");
	});
	it("handles function_call shorthand", () => {
		const result = extractAssistantToolCalls({
			function_call: { name: "ls", arguments: '{"path":"."}' },
		});
		assert.equal(result[0].name, "ls");
	});
	it("extracts from output array with tool_use type", () => {
		const result = extractAssistantToolCalls({
			output: [{ type: "tool_use", id: "tc-output", name: "read", input: { path: "src/index.ts" } }],
		});
		assert.equal(result.length, 1);
		assert.equal(result[0].id, "tc-output");
		assert.equal(result[0].name, "read");
		assert.ok(result[0].args.includes("src/index.ts"));
	});
	it("returns empty for no tool calls", () => {
		assert.equal(extractAssistantToolCalls({ role: "assistant", content: "text" }).length, 0);
	});
	it("handles structured args via JSON.stringify", () => {
		const result = extractAssistantToolCalls({
			tool_calls: [{ id: "tc1", function: { name: "read", arguments: { path: "x" } } }],
		});
		assert.ok(typeof result[0].args === "string");
		assert.ok(result[0].args.includes("x"));
	});
});

describe("hasAssistantToolCalls", () => {
	it("returns true when assistant has tool_calls", () => {
		assert.ok(hasAssistantToolCalls({ role: "assistant", tool_calls: [{ id: "tc1" }] }));
	});
	it("returns false for user messages", () => {
		assert.equal(hasAssistantToolCalls({ role: "user", content: "hi" }), false);
	});
	it("returns false for assistant without tool calls", () => {
		assert.equal(hasAssistantToolCalls({ role: "assistant", content: "text" }), false);
	});
});

describe("captureTurnEndBatch", () => {
	it("captures turn end with message and tool results", () => {
		const state = { pendingBatches: [] };
		const count = captureTurnEndBatch(
			{
				message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				toolResults: [{ toolCallId: "tc1", content: "file content" }],
			},
			[],
			state,
			1,
		);
		assert.equal(count, 1);
		assert.equal(state.pendingBatches.length, 1);
	});

	it("ignores non-text tool result content parts", () => {
		const state = { pendingBatches: [] };
		const count = captureTurnEndBatch(
			{
				message: { role: "assistant", tool_calls: [{ id: "tc-image", function: { name: "read", arguments: "{}" } }] },
				toolResults: [{ toolCallId: "tc-image", content: [{ type: "image", data: "x" }, { type: "text", text: "text result" }] }],
			},
			[],
			state,
			1,
		);
		assert.equal(count, 1);
		assert.equal(state.pendingBatches[0].toolCalls[0].result, "text result");
	});
	it("returns 0 when no tool calls in message", () => {
		const state = { pendingBatches: [] };
		const count = captureTurnEndBatch(
			{ message: { role: "assistant", content: "text" }, toolResults: [] },
			[],
			state,
			1,
		);
		assert.equal(count, 0);
	});
	it("skips already-pending ids", () => {
		const state = { pendingBatches: [{ turnIndex: 0, toolCalls: [{ id: "tc1", name: "read", turnIndex: 0 }] }] };
		const count = captureTurnEndBatch(
			{
				message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] },
				toolResults: [{ toolCallId: "tc1", content: "file" }],
			},
			[],
			state,
			1,
		);
		assert.equal(count, 0);
	});
	it("handles arrays of messages", () => {
		const state = { pendingBatches: [] };
		const count = captureTurnEndBatch(
			{ messages: [{ message: { role: "user", content: "hello" }, turnIndex: 1 }] },
			[],
			state,
			1,
		);
		assert.equal(count, 0);
	});
});

describe("captureBatches", () => {
	it("captures tool sequences from branch", () => {
		const state = { pendingBatches: [], batchStepCounter: 0 };
		captureBatches(
			[
				{ message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 1 },
				{ message: { role: "tool", toolCallId: "tc1", content: "result" }, turnIndex: 1 },
			],
			[],
			state,
			1,
		);
		assert.equal(state.pendingBatches.length, 1);
		assert.equal(state.pendingBatches[0].toolCalls.length, 1);
	});
	it("skips summarized ids", () => {
		const state = { pendingBatches: [], batchStepCounter: 0 };
		captureBatches(
			[
				{ message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 1 },
				{ message: { role: "tool", toolCallId: "tc1", content: "result" }, turnIndex: 1 },
			],
			["tc1"],
			state,
			1,
		);
		assert.equal(state.pendingBatches.length, 0);
	});
	it("flushes pending batch at dialogue gap", () => {
		const state = { pendingBatches: [], batchStepCounter: 0 };
		captureBatches(
			[
				{ message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 1 },
				{ message: { role: "tool", toolCallId: "tc1", content: "result" }, turnIndex: 1 },
				{ message: { role: "user", content: "ok" }, turnIndex: 1 },
				{ message: { role: "user", content: "next" }, turnIndex: 1 },
				{ message: { role: "user", content: "another" }, turnIndex: 1 },
				{ message: { role: "assistant", tool_calls: [{ id: "tc2", function: { name: "bash", arguments: "ls" } }] }, turnIndex: 2 },
				{ message: { role: "tool", toolCallId: "tc2", content: "files" }, turnIndex: 2 },
			],
			[],
			state,
			1,
			{ bridgeLength: 2 },
		);
		assert.equal(state.pendingBatches.length, 2);
	});
});

describe("shouldTriggerPrune", () => {
	it("every-turn triggers when has tools", () => {
		assert.ok(shouldTriggerPrune("every-turn", 0, 2, true));
	});
	it("every-turn does not trigger without tools", () => {
		assert.equal(shouldTriggerPrune("every-turn", 0, 2, false), false);
	});
	it("agent-message triggers by batch step", () => {
		assert.ok(shouldTriggerPrune("agent-message", 3, 2, false));
	});
	it("agent-message does not trigger below min turns", () => {
		assert.equal(shouldTriggerPrune("agent-message", 1, 2, true), false);
	});
	it("checkpoint returns false always", () => {
		assert.equal(shouldTriggerPrune("checkpoint", 0, 0, true), false);
	});
	it("on-demand returns false always", () => {
		assert.equal(shouldTriggerPrune("on-demand", 0, 0, true), false);
	});
	it("agentic-auto triggers with tools and batch step", () => {
		assert.ok(shouldTriggerPrune("agentic-auto", 3, 2, true));
	});
	it("agentic-auto does not trigger without tools", () => {
		assert.equal(shouldTriggerPrune("agentic-auto", 3, 2, false), false);
	});
	it("agentic-auto does not trigger below min turns", () => {
		assert.equal(shouldTriggerPrune("agentic-auto", 1, 2, true), false);
	});
	it("default mode triggers with tools", () => {
		assert.ok(shouldTriggerPrune("unknown", 0, 2, true));
	});
	it("default mode does not trigger without tools", () => {
		assert.equal(shouldTriggerPrune("unknown", 0, 2, false), false);
	});
});

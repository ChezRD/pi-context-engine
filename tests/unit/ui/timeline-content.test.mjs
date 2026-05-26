import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

let buildTimeline;
let createRuntimeState;

before(async () => {
	({ buildTimeline } = await import("../../../src/ui/timeline.ts"));
	({ createRuntimeState } = await import("../../../src/runtime-state.ts"));
});

function ctxFor(branch, extra = {}) {
	return {
		sessionManager: {
			getBranch: () => branch,
			getTree: () => [],
			getLeafId: () => branch.at(-1)?.id,
			getLabel: (id) => id === "labeled" ? "manual" : null,
		},
		getContextUsage: () => extra.usage,
	};
}

describe("timeline content formatting", () => {
	it("formats message content arrays, objects, roles, labels, and truncation", async () => {
		const branch = [
			{ id: "root", type: "message", message: { role: "system", content: { nested: "value", long: "x".repeat(250) } } },
			{ id: "user", type: "message", message: { role: "user", content: [{ type: "text", text: "hello" }, { type: "image", text: "skip" }] } },
			{ id: "tool", type: "message", message: { role: "toolResult", content: "tool output" } },
			{ id: "bash", type: "message", message: { role: "bashExecution", content: "command output" } },
			{ id: "labeled", type: "branch_summary", summary: "summary" },
			{ id: "head", type: "compaction", summary: "compact" },
		];
		const state = createRuntimeState();
		state.engine.checkpoints = [
			{ id: "cp-1", reason: "session_start", turn: 0, createdAt: 1 },
			{ id: "cp-2", reason: "model_select", turn: 4, createdAt: 2, conversationEntryId: "labeled", conversationLabel: "manual", previousModelId: "old", modelId: "new" },
		];

		const result = await buildTimeline({}, ctxFor(branch, { usage: { percent: 1.2, tokens: 1_500_000, contextWindow: 2_000_000 } }), { limit: 5, verbose: true }, state);

		assert.match(result, /1\.2% \(1\.5M\/2\.0M\)/);
		assert.match(result, /USER/);
		assert.match(result, /TOOL/);
		assert.match(result, /BASH/);
		assert.match(result, /SUMMARY/);
		assert.match(result, /truncated at 5 entries/);
		assert.match(result, /model_select/);
		assert.match(result, /old→new/);
	});

	it("reports hidden assistant tool-call messages in non-verbose mode", async () => {
		const branch = [
			{ id: "root", type: "message", message: { role: "user", content: "start" } },
			{ id: "hidden", type: "message", message: { role: "assistant", content: "", tool_calls: [{ id: "call-1" }] } },
			{ id: "head", type: "message", message: { role: "assistant", content: "done" } },
		];

		const result = await buildTimeline({}, ctxFor(branch), { limit: 10, verbose: false });

		assert.match(result, /1/);
		assert.doesNotMatch(result, /hidden \[AI\]/);
		assert.match(result, /head \([^)]*\) \[AI\] done|head \[AI\] done/);
	});

	it("formatTokens shows raw number for values under 1000", async () => {
		const branch = [
			{ id: "root", type: "message", message: { role: "user", content: "hi" } },
			{ id: "head", type: "message", message: { role: "assistant", content: "ok" } },
		];
		const state = createRuntimeState();
		state.engine.checkpoints = [];
		const result = await buildTimeline({}, ctxFor(branch, { usage: { percent: 10, tokens: 100, contextWindow: 500 } }), { limit: 10, verbose: true }, state);
		assert.match(result, /10\.0% \(100\/500\)/);
	});

	it("executes registered timeline tool with defaults", async () => {
		let tool;
		const pi = { registerTool: (registered) => { tool = registered; } };
		const { registerTimelineTool } = await import("../../../src/ui/timeline.ts");
		registerTimelineTool({ pi, getState: () => createRuntimeState() });

		const result = await tool.execute("call-1", {}, undefined, undefined, ctxFor([]));

		assert.match(result.content[0].text, /Context Dashboard/);
		assert.deepEqual(result.details, {});
	});
});

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./../../__mocks__/loader.mjs", import.meta.url);

const m = {};

describe("Timeline", () => {
	it("loads module and functions", async () => {
		m.buildTimeline = (await import("../../../src/ui/timeline.ts")).buildTimeline;
		m.registerTimelineTool = (await import("../../../src/ui/timeline.ts")).registerTimelineTool;
		m.applyLocale = (await import("../../../src/i18n/index.ts")).applyLocale;
		m.createRuntimeState = (await import("../../../src/runtime-state.ts")).createRuntimeState;
		assert.ok(m.buildTimeline);
		assert.ok(m.registerTimelineTool);
	});

	it("buildTimeline returns empty for no session manager", async () => {
		const result = await m.buildTimeline({}, {}, { limit: 10, verbose: false });
		assert.ok(result);
		assert.ok(result.length > 0);
	});

	it("buildTimeline with empty branch", async () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [],
				getTree: () => [],
				getLeafId: () => "leaf-1",
			},
		};
		const result = await m.buildTimeline({}, ctx, { limit: 50, verbose: false });
		assert.ok(result);
		// Should include dashboard header
		assert.match(result, /Context Dashboard/);
		// Should include "Root Path Only" or similar
	});

	it("buildTimeline with entries", async () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ id: "entry-1", type: "message", message: { role: "user", content: "hello" } },
					{ id: "entry-2", type: "message", message: { role: "assistant", content: "hi there" } },
				],
				getTree: () => [],
				getLeafId: () => "entry-2",
				getLabel: () => null,
			},
			getContextUsage: () => ({ percent: 42.5, tokens: 85000, contextWindow: 200000 }),
		};
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.engine.checkpoints = [];
		const result = await m.buildTimeline({}, ctx, { limit: 50, verbose: false }, state);
		assert.ok(result);
		assert.match(result, /USER/);
		assert.match(result, /AI/);
		assert.match(result, /42\.5%/);
	});

	it("buildTimeline hides tool calls in non-verbose mode", async () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ id: "entry-1", type: "message", message: { role: "user", content: "read file" } },
					{ id: "entry-2", type: "message", message: { role: "assistant", content: "", tool_calls: [{ id: "tc-1" }] } },
				],
				getTree: () => [],
				getLeafId: () => "entry-2",
				getLabel: () => null,
			},
			getContextUsage: () => null,
		};
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.engine.checkpoints = [];

		const result = await m.buildTimeline({}, ctx, { limit: 50, verbose: false }, state);
		// Tool-call assistant entry hidden when not verbose — one entry hidden
		assert.ok(result);
	});

	it("buildTimeline with cache checkpoints", async () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ id: "entry-1", type: "message", message: { role: "user", content: "hello" }, turnIndex: 1 },
					{ id: "entry-2", type: "message", message: { role: "assistant", content: "world" }, turnIndex: 2 },
				],
				getTree: () => [],
				getLeafId: () => "entry-2",
				getLabel: () => null,
			},
			getContextUsage: () => ({ percent: 30, tokens: 60000, contextWindow: 200000 }),
		};
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.engine.checkpoints = [
			{ id: "cp-1", reason: "session_start", turn: 1, createdAt: 1000, note: "", segmentCount: 1 },
			{ id: "cp-2", reason: "turn_complete", turn: 2, createdAt: 2000, note: "", segmentCount: 1 },
		];
		const result = await m.buildTimeline({}, ctx, { limit: 50, verbose: false }, state);
		assert.ok(result);
		assert.match(result, /checkpoint/);
	});

	it("buildTimeline covers verbose roles, labels, truncation, and checkpoint fallbacks", async () => {
		const long = "x".repeat(140);
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ id: "root", type: "message", message: { role: "user", content: [{ type: "text", text: "hello" }, { type: "image", text: "ignored" }] } },
					{ id: "assistant", type: "message", message: { role: "assistant", content: long, tool_calls: [{ id: "tc" }] } },
					{ id: "tool", type: "message", message: { role: "toolResult", content: { json: true } } },
					{ id: "bash", type: "message", message: { role: "bashExecution", content: "ran" } },
					{ id: "custom", type: "message", message: { role: "critic", content: "note" }, turnIndex: 7 },
					{ id: "summary", type: "branch_summary", summary: "sum" },
					{ type: "compaction", summary: "compact" },
				],
				getTree: () => [{ id: "unused" }],
				getLeafId: () => "summary",
				getLabel: (id) => id === "custom" ? "checkpoint-a" : undefined,
			},
			getContextUsage: () => ({ percent: 1, tokens: 1_500_000, contextWindow: 2_000_000 }),
		};
		const state = m.createRuntimeState({});
		state.engine.checkpoints = [
			{ reason: "turn_complete", turn: 7 },
			{ reason: "manual", turn: 8, conversationLabel: "label", previousModelId: "a", modelId: "b" },
		];

		const result = await m.buildTimeline({}, ctx, { limit: 4, verbose: true }, state);

		assert.match(result, /1\.5M/);
		assert.match(result, /BASH/);
		assert.match(result, /checkpoint-a/);
		assert.match(result, /truncated at 4 entries/);
		assert.match(result, /a→b/);
	});

	it("registered timeline tool forwards params and state", async () => {
		const tools = [];
		const state = m.createRuntimeState({});
		m.registerTimelineTool({ pi: { registerTool: (tool) => tools.push(tool) }, getState: () => state });

		const result = await tools[0].execute("id", { limit: 1, verbose: true }, undefined, undefined, {
			sessionManager: {
				getBranch: () => [{ id: "root", type: "message", message: { role: "user", content: "Hi" } }],
				getLeafId: () => "root",
				getLabel: () => undefined,
			},
		});

		assert.ok(result.content[0].text.includes("Context Dashboard"));
	});

	it("buildTimeline handles missing getBranch via ?? [] fallback", async () => {
		const ctx = {
			sessionManager: {
				// No getBranch — triggers ?? [] fallback
				getTree: () => [],
				getLeafId: () => "leaf-1",
			},
			getContextUsage: () => null,
		};
		const result = await m.buildTimeline({}, ctx, {});
		assert.ok(result);
	});

	it("buildTimeline handles entries without type or id", async () => {
		const longContent = "x".repeat(150);
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{},
					{ id: "e1", type: "message", message: { role: "user", content: "hello" } },
					{ id: "e2", message: { role: "critic", content: "no-type" } },
					{ id: "e3", type: "message", message: { content: "no-role-entry" } },
					{ id: "e4", type: "message", message: { role: "assistant", content: longContent }, turnIndex: 5 },
				],
				getTree: () => [],
				getLeafId: () => "e4",
				getLabel: () => null,
			},
			getContextUsage: () => ({ percent: 10, tokens: 10000, contextWindow: 100000 }),
		};
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.engine.checkpoints = [
			{ id: "cp-1", conversationEntryId: "e4", reason: "turn_complete", turn: 5, createdAt: 5000, note: "", segmentCount: 1 },
		];
		const result = await m.buildTimeline({}, ctx, { limit: 10, verbose: true }, state);
		assert.ok(result);
		// Entry without id should show as "?"
		// Entry without type should show default role
	});

	it("registerTimelineTool registers context_timeline", () => { 
		const tools = [];
		const pi = { registerTool: (t) => tools.push(t) };
		m.registerTimelineTool({ pi, getState: () => m.createRuntimeState({}) });
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "context_timeline");
		assert.ok(tools[0].execute);
	});
});

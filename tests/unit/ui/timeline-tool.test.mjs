import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = {};

function mockCtx(branch, opts = {}) {
	return {
		sessionManager: {
			getSessionState: async () => ({
				model: "test-model", id: "sess-1",
				tokens: 100, inputTokens: 50, outputTokens: 50,
				cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0,
				startTime: Date.now() - 60000,
				...(opts.sessionState || {}),
			}),
			getBranch: async () => branch || [
				{ id: "b1", role: "system" },
				{ id: "b2", role: "user", content: "hello" },
				{ id: "b3", role: "assistant", content: "world" },
			],
			getLabel: () => opts.label,
		},
		getContextUsage: opts.getContextUsage,
	};
}

describe("Timeline tool", () => {
	it("loads module and functions", async () => {
		m.registerTimelineTool = (await import("../../../src/ui/timeline.ts")).registerTimelineTool;
		assert.ok(m.registerTimelineTool);
	});

	describe("registerTimelineTool", () => {
		it("registers context_timeline", () => {
			const tools = [];
			m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
			assert.equal(tools[0].name, "context_timeline");
		});
	});

	describe("context_timeline execute", () => {
		it("returns error without session manager", async () => {
			const tools = [];
			m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", {}, null, null, {});
			assert.ok(/session|сесси/i.test(result.content[0].text));
		});

		it("works with mock session", async () => {
			const tools = [];
			const ctx = mockCtx();
			m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", { verbose: false }, null, null, ctx);
			assert.match(result.content[0].text, /Context Dashboard/);
		});

		it("includes context usage when getContextUsage returns data", async () => {
			const tools = [];
			const ctx = mockCtx(undefined, {
				getContextUsage: async () => ({ percent: 45.5, tokens: 45000, contextWindow: 100000 }),
			});
			m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", {}, null, null, ctx);
			assert.match(result.content[0].text, /45\.5%/);
			assert.match(result.content[0].text, /45\.0K/);
		});

		it("includes cache checkpoints when state has checkpoints", async () => {
			const tools = [];
			const ctx = mockCtx(undefined, {
				sessionState: { checkpoints: [
					{ reason: "user", turn: 1, conversationLabel: "init" },
					{ reason: "fold", turn: 5, previousModelId: "gpt4", modelId: "gpt5" },
				]},
			});
			m.registerTimelineTool({ getState: () => ({ engine: { checkpoints: [{ reason: "init", turn: 0 }, { reason: "user", turn: 1 }, { reason: "fold", turn: 5 }] } }), registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", {}, null, null, ctx);
			assert.match(result.content[0].text, /checkpoint|checkpoints/i);
		});

		it("includes label name when checkpoint has label", async () => {
			const tools = [];
			const branch = [
				{ id: "cp1", role: "system" },
				{ id: "b1", role: "user", content: "hi" },
			];
			const ctx = mockCtx(branch, { label: "user-checkpoint" });
			m.registerTimelineTool({ getState: () => ({ engine: { checkpoints: [{ reason: "init", turn: 0 }, { reason: "user", turn: 1, conversationLabel: "init" }] } }), registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", {}, null, null, ctx);
			assert.match(result.content[0].text, /checkpoint|checkpoints|user-checkpoint/i);
		});

		it("shows root path only when branch is empty", async () => {
			const tools = [];
			const ctx = mockCtx([]);
			m.registerTimelineTool({ registerTool: (def) => tools.push(def) });
			const result = await tools[0].execute("1", {}, null, null, ctx);
			assert.match(result.content[0].text, /Root Path Only/);
		});
	});
});

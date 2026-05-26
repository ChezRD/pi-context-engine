import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("../../__mocks__/loader.mjs", import.meta.url);

let createRuntimeState;
let showDashboard;
let allocateSlots;

before(async () => {
	({ createRuntimeState } = await import("../../../src/runtime-state.ts"));
	({ showDashboard, allocateSlots } = await import("../../../src/ui/dashboard.ts"));
});

const theme = {
	fg: (_color, value) => value,
	bold: (value) => value,
};

function createDashboardState(overrides = {}) {
	const state = createRuntimeState({ model: { id: "deepseek-chat", provider: "deepseek" } });
	state.config = {
		...state.config,
		dashboardVerbosity: overrides.dashboardVerbosity ?? "debug",
		pruneEnabled: overrides.pruneEnabled ?? true,
		pruneOn: overrides.pruneOn ?? "agent-message",
		pruneBatchSize: overrides.pruneBatchSize ?? 2,
	};
	state.stats.requests = 2;
	state.stats.input = 1000;
	state.stats.cacheRead = 700;
	state.stats.cacheWrite = 100;
	state.stats.output = 50;
	state.stats.cost = 0.02;
	state.stats.savings = 0.04;
	state.stats.last = { input: 100, cacheRead: 90, cacheWrite: 0, output: 5, createdAt: 1 };
	state.stats.usages = [
		{ input: 100, cacheRead: 90, cacheWrite: 0, output: 5, actualCost: 0.001, noCacheCost: 0.003, savings: 0.002, segmentId: "segment-1", modelId: "deepseek-chat", provider: "deepseek", createdAt: 1 },
		{ input: 900, cacheRead: 610, cacheWrite: 100, output: 45, actualCost: 0.019, noCacheCost: 0.04, savings: 0.021, segmentId: "segment-1", modelId: "deepseek-chat", provider: "deepseek", createdAt: 2 },
	];
	state.engine.prune.pendingBatches = [{ turnIndex: 1, toolCalls: [{ id: "call-1", name: "read", result: "x".repeat(20) }] }];
	state.engine.prune.summarizedIds = ["call-1", "call-2"];
	state.engine.prune.appliedIds = ["call-1"];
	state.engine.prune.pruneRunCount = 1;
	state.engine.prune.batchStepCounter = 2;
	state.engine.prune.awaitingAgentMessage = true;
	state.engine.prune.impact = {
		...state.engine.prune.impact,
		summarizeRequests: 1,
		summarizeInputTokens: 200,
		summarizeOutputTokens: 50,
		summarizeCost: 0.002,
		summarizeCacheReadTokens: 120,
		summarizeByModel: [
			{ modelId: "deepseek-chat", provider: "deepseek", requests: 1, inputTokens: 20, cacheReadTokens: 10, outputTokens: 5, cost: 0.001 },
			{ modelId: "summary-model", provider: "deepseek", requests: 1, inputTokens: 200, cacheReadTokens: 120, outputTokens: 50, cost: 0.002 },
		],
		postPruneRequests: 1,
		postPruneMissTokens: 40,
		postPruneCacheReadTokens: 80,
		postPruneMissCost: 0.003,
		postPruneLookupRegret: 1,
		postPruneReadRegret: 2,
		postFoldReadRegret: 3,
		pendingBatchesPreservedDuringFlush: 1,
		pendingToolCallsPreservedDuringFlush: 1,
		lastPendingBatchesPreservedDuringFlush: 1,
		lastPendingToolCallsPreservedDuringFlush: 1,
		noOpToolCalls: 1,
		lastNoOpToolCalls: 1,
		lastSummarizeCost: 0.002,
		lastPostPruneMissCost: 0.003,
		lastPostPruneHitRate: 0.8,
		lastSummarizeRawChars: 400,
		lastSummarizeSummaryChars: 100,
		lastRebuildSourceMessages: 4,
		lastRebuildOutputMessages: 3,
		lastRebuildPrunableIds: 2,
		lastRebuildNewlyApplied: 1,
		lastRebuildSavedApproxChars: 200,
		lastRebuildCheckpointOpened: true,
		lastErrorKey: "ui.dashboard.unavailable",
	};
	state.engine.prefixDriftCount = 1;
	state.engine.toolHashChanges = 1;
	state.engine.historyRewriteCount = 1;
	state.pinStore.set("priority", "pin", "remember");
	return state;
}

function createPi() {
	return {
		getActiveTools: () => ["read"],
		getAllTools: () => [{ name: "read", description: "Read files", inputSchema: { type: "object" } }],
	};
}

function createCtx(extra = {}) {
	return {
		getContextUsage: async () => ({ tokens: 100, contextWindow: 4000 }),
		getSystemPrompt: () => "system prompt",
		sessionManager: {
			getBranch: () => [
				{ type: "message", message: { role: "user", content: "hello" } },
				{ type: "message", message: { role: "assistant", content: [{ text: "answer" }, { thinking: "thinking content" }, { type: "toolCall", name: "read", input: { path: "src/a.ts" } }], tool_calls: [{ id: "call-1", function: { name: "read" } }] } },
				{ type: "message", message: { role: "tool", content: [{ text: "tool result" }] } },
				{ type: "message", message: { role: "bash", command: "ls" } },
				{ type: "custom_message", content: "custom", customType: "note" },
				{ type: "branch_summary", summary: "branch" },
				{ type: "compaction", summary: "compact" },
			],
		},
		ui: {},
		...extra,
	};
}

describe("showDashboard", () => {
	it("renders the overlay dashboard and handles input", async () => {
		let rendered = [];
		let handled = false;
		let customOptions;
		const ctx = createCtx({
			ui: {
				custom: async (factory, options) => {
				customOptions = options;
				const component = factory(null, theme, null, () => {});
				rendered = component.render(90);
				handled = ["down", "up", "pageDown", "pageUp", "x"].every((input) => component.handleInput(input));
				component.invalidate();
			},
			},
		});

		await showDashboard(createPi(), ctx, createDashboardState());

		assert.equal(customOptions.overlay, true);
		assert.equal(handled, true);
		assert.ok(rendered.length > 0);
		assert.ok(rendered.some((line) => line.includes("deepseek/deepseek-chat")));
	});

	it("falls back to text notification when custom UI is unavailable", async () => {
		let notified = "";
		let level = "";
		const ctx = createCtx({
			ui: {
				notify: (message, kind) => {
					notified = message;
					level = kind;
				},
			},
		});

		await showDashboard(createPi(), ctx, createDashboardState({ dashboardVerbosity: "compact", pruneOn: "on-demand" }));

		assert.equal(level, "info");
		assert.match(notified, /3\.9K|4000|4\.0K/);
		assert.match(notified, /\$0\.0400/);
	});

	it("renders no-usage, ready, and collecting prune states", async () => {
		const rendered = [];
		const ctx = createCtx({
			ui: {
				custom: async (factory) => {
					const component = factory(null, theme, null, () => {});
					rendered.push(component.render(140).join("\n"));
				},
			},
		});

		const noUsage = createDashboardState();
		noUsage.stats.requests = 0;
		noUsage.stats.usages = [];
		await showDashboard(createPi(), ctx, noUsage);

		const ready = createDashboardState();
		ready.engine.prune.awaitingAgentMessage = false;
		ready.engine.prune.batchStepCounter = ready.config.pruneBatchSize;
		await showDashboard(createPi(), ctx, ready);

		const collecting = createDashboardState();
		collecting.engine.prune.awaitingAgentMessage = false;
		collecting.engine.prune.batchStepCounter = 1;
		await showDashboard(createPi(), ctx, collecting);

		assert.equal(rendered.length, 3);
		assert.ok(rendered.every((item) => item.length > 0));
	});

	it("allocates remaining graph slots by fractional remainders", () => {
		const slots = allocateSlots([
			{ value: 1 },
			{ value: 1 },
			{ value: 1 },
		], 10, 8);
		assert.deepEqual(slots, [3, 3, 2]);
	});

	it("notifies when usage data is unavailable", async () => {
		let level = "";
		const ctx = createCtx({
			getContextUsage: async () => null,
			ui: { notify: (_message, kind) => { level = kind; } },
		});

		await showDashboard(createPi(), ctx, createDashboardState());

		assert.equal(level, "warning");
	});

	it("runs registered command handler with current state", async () => {
		let handler;
		const pi = {
			...createPi(),
			registerCommand: (_name, def) => { handler = def.handler; },
		};
		const ctx = createCtx({
			ui: {
				custom: async (factory) => {
					const component = factory(null, theme, null, () => {});
					component.render(90);
				},
			},
		});
		const { registerDashboardCommand } = await import("../../../src/ui/dashboard.ts");

		registerDashboardCommand({ pi, getState: () => createDashboardState() });
		await handler("", ctx);

		assert.equal(typeof handler, "function");
	});
});

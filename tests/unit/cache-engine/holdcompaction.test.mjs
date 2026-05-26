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

describe("holdCompaction", () => {
  it("loads module and functions", async () => {
m.holdCompaction = (await import("../../../src/cache-engine/auto-compact.ts")).holdCompaction;
m.requestFold = (await import("../../../src/cache-engine/auto-compact.ts")).requestFold;
m.requestCompact = (await import("../../../src/cache-engine/auto-compact.ts")).requestCompact;
m.autoHandleTurnEnd = (await import("../../../src/cache-engine/auto-compact.ts")).handleTurnEnd;
m.handleAgentMessagePrune = (await import("../../../src/cache-engine/auto-compact.ts")).handleAgentMessagePrune;
m.flushPendingPrune = (await import("../../../src/cache-engine/auto-compact.ts")).flushPendingPrune;
m.estimateTokens = (await import("../../../src/cache-engine/custom-compaction.ts")).estimateTokens;
m.compactOptions = (await import("../../../src/cache-engine/custom-compaction.ts")).compactOptions;
m.foldInstructions = (await import("../../../src/cache-engine/custom-compaction.ts")).foldInstructions;
m.maybeAdjustCutForCache = (await import("../../../src/cache-engine/custom-compaction.ts")).maybeAdjustCutForCache;
m.handleSessionBeforeCompact = (await import("../../../src/cache-engine/custom-compaction.ts")).handleSessionBeforeCompact;
m.DEFAULT_CONFIG = (await import("../../../src/config.ts")).DEFAULT_CONFIG;
m.createRuntimeState = (await import("../../../src/runtime-state.ts")).createRuntimeState;
m.lifecycleHandleBeforeAgentStart = (await import("../../../src/cache-engine/index.ts")).handleBeforeAgentStart;
m.lifecycleHandleMessageEnd = (await import("../../../src/cache-engine/index.ts")).handleMessageEnd;
m.lifecycleHandleContext = (await import("../../../src/cache-engine/index.ts")).handleContext;
m.lifecycleHandleBeforeProviderRequest = (await import("../../../src/cache-engine/index.ts")).handleBeforeProviderRequest;
m.lifecycleHandleInput = (await import("../../../src/cache-engine/index.ts")).handleInput;
m.applyLocale = (await import("../../../src/i18n/index.ts")).applyLocale;
    assert.ok(m.holdCompaction);
  });

describe("holdCompaction", () => {
	it("sets holdUntilTurn", () => {
		const state = { engine: { turnIndex: 5, holdUntilTurn: 0, lastDecision: "" }, config: { minTurnsBetweenCompacts: 3 } };
		m.holdCompaction(state);
		assert.ok(state.engine.holdUntilTurn >= 8);
		assert.equal(state.engine.lastDecision, "hold");
	});
	it("uses the explicit turn override when provided", () => {
		const state = { engine: { turnIndex: 5, holdUntilTurn: 0, lastDecision: "" }, config: { minTurnsBetweenCompacts: 3 } };
		m.holdCompaction(state, 7);
		assert.equal(state.engine.holdUntilTurn, 12);
	});
	it("holds for at least one turn even when zero is requested", () => {
		const state = { engine: { turnIndex: 5, holdUntilTurn: 0, lastDecision: "" }, config: { minTurnsBetweenCompacts: 3 } };
		m.holdCompaction(state, 0);
		assert.equal(state.engine.holdUntilTurn, 6);
	});
});

describe("custom-compaction helpers", () => {
	it("estimateTokens handles nullish, strings, and structured values", () => {
		assert.equal(m.estimateTokens(undefined), 0);
		assert.equal(m.estimateTokens(null), 0);
		assert.equal(m.estimateTokens("x".repeat(9)), 2);
		assert.equal(m.estimateTokens({ a: "x".repeat(7) }), Math.round(JSON.stringify({ a: "x".repeat(7) }).length / 4));
	});

	it("compactOptions injects fold instructions only when autoFold is enabled", () => {
		const enabled = m.compactOptions({ ...m.DEFAULT_CONFIG, autoFold: true, foldSummaryModel: "model-a" }, {}, { engine: { toolIntent: { lastUserIntent: { kind: "analyze", reasonCode: "analysis_request", confidence: "medium", matchedAction: "audit" } } } });
		assert.match(enabled.customInstructions, /pi-context-engine fold/);
		assert.match(enabled.customInstructions, /model-a/);
		assert.match(enabled.customInstructions, /Current detected user intent: analyze/);
		assert.match(enabled.customInstructions, /structured tool calls/);

		const disabled = m.compactOptions({ ...m.DEFAULT_CONFIG, autoFold: false, foldSummaryModel: "model-a" }, {});
		assert.equal(disabled.customInstructions, undefined);
	});

	it("foldInstructions preserve current task state guidance and configured summary model", () => {
		const instructions = m.foldInstructions({ ...m.DEFAULT_CONFIG, foldSummaryModel: "deepseek-v4-flash" });
		assert.match(instructions, /preserve current task state/);
		assert.match(instructions, /deepseek-v4-flash/);
	});

	it("maybeAdjustCutForCache leaves host boundary unchanged and empty compact is cancelled", () => {
		assert.equal(m.maybeAdjustCutForCache([{ id: "a" }, { id: "b" }], 1, 0.2), undefined);
		assert.equal(m.handleSessionBeforeCompact({ entries: [] }, {}, { config: { ...m.DEFAULT_CONFIG, enabled: false } }), undefined);
		assert.deepEqual(
			m.handleSessionBeforeCompact({ preparation: { messagesToSummarize: [], turnPrefixMessages: [] } }, {}, { config: { ...m.DEFAULT_CONFIG, enabled: true } }),
			{ cancel: true },
		);
		assert.equal(
			m.handleSessionBeforeCompact({ preparation: { messagesToSummarize: [{ role: "user", content: "x" }], turnPrefixMessages: [] } }, {}, { config: { ...m.DEFAULT_CONFIG, enabled: true } }),
			undefined,
		);
	});
});

describe("auto-compact", () => {
	const makeState = () => {
		const state = m.createRuntimeState();
		Object.assign(state.config, {
			enabled: true,
			autoFold: true,
			foldTailPct: 0.1,
			aggressiveFoldTailPct: 0.1,
			minFoldSavings: 0,
			pruneEnabled: true,
			pruneOn: "every-turn",
			pruneBatchSize: 1,
			pruneModel: "deepseek/deepseek-v4-flash",
			pruneIncludeContext: false,
		});
		return state;
	};

	it("requestFold prefers semantic fold before ctx.compact", async () => {
		const state = makeState();
		state.engine.turnIndex = 7;
		const compactCalls = [];
		const branch = [
			{ id: "e5", message: { role: "assistant", content: "final answer" } },
			{ id: "e4", message: { role: "user", content: "wrap up" } },
			{ id: "e3", message: { role: "assistant", content: "a".repeat(180) } },
			{ id: "e2", message: { role: "user", content: "b".repeat(180) } },
			{ id: "e1", message: { role: "system", content: "c".repeat(180) } },
		];
		const ctx = {
			getContextUsage: () => ({ ctxMax: 100, maxTokens: 100 }),
			sessionManager: { getBranch: async () => branch },
			model: { id: "deepseek/deepseek-v4-flash" },
			compact: () => compactCalls.push(true),
		};

		const result = await m.requestFold({ complete: async () => "folded summary" }, ctx, state);

		assert.deepEqual(result, { ok: true });
		assert.equal(compactCalls.length, 0);
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 7);
		assert.equal(state.engine.semanticFold.active, true);
		assert.match(state.engine.semanticFold.syntheticMsg.content[0].text, /folded summary/);
	});

	it("requestFold falls back to native compact when semantic fold cannot run", async () => {
		const state = makeState();
		state.engine.turnIndex = 3;
		let compactCalls = 0;
		const ctx = {
			getContextUsage: () => ({ ctxMax: 0 }),
			compact: ({ onComplete }) => {
				compactCalls++;
				onComplete({ summary: "native compact" });
			},
		};

		const result = await m.requestFold({ complete: async () => "unused" }, ctx, state);

		assert.deepEqual(result, { ok: true });
		assert.equal(compactCalls, 1);
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 3);
	});

	it("requestFold returns an error when semantic fold fails and native compact is unavailable", async () => {
		const state = makeState();
		state.engine.turnIndex = 1;
		const result = await m.requestFold({ complete: async () => "unused" }, { getContextUsage: () => ({ ctxMax: 0 }) }, state);
		assert.equal(result.ok, false);
		assert.equal(typeof result.error, "string");
		assert.ok(result.error.length > 0);
		assert.equal(state.engine.compactCount, 0);
	});

	it("requestFold handles native compact onError and still records the attempted compact", async () => {
		const state = makeState();
		state.engine.turnIndex = 6;
		const result = await m.requestFold(
			{ complete: async () => "unused" },
			{
				getContextUsage: () => ({ ctxMax: 0 }),
				compact: ({ onError }) => onError(new Error("native compact failed")),
			},
			state,
		);
		assert.equal(result.ok, false);
		assert.equal(result.error, "native compact failed");
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 6);
	});

	it("requestFold handles native compact promise return", async () => {
		const state = makeState();
		state.engine.turnIndex = 8;
		const result = await m.requestFold(
			{ complete: async () => "unused" },
			{
				getContextUsage: () => ({ ctxMax: 0 }),
				compact: () => Promise.resolve(),
			},
			state,
		);
		assert.deepEqual(result, { ok: true });
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 8);
	});

	it("requestFold handles native compact promise rejection", async () => {
		const state = makeState();
		state.engine.turnIndex = 8;
		const result = await m.requestFold(
			{ complete: async () => "unused" },
			{
				getContextUsage: () => ({ ctxMax: 0 }),
				compact: () => Promise.reject(new Error("promise compact failed")),
			},
			state,
		);
		assert.equal(result.ok, false);
		assert.equal(result.error, "promise compact failed");
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 8);
	});

	it("requestFold catches native compact synchronous throws and records the attempt", async () => {
		const state = makeState();
		state.engine.turnIndex = 10;
		const result = await m.requestFold(
			{ complete: async () => "unused" },
			{
				getContextUsage: () => ({ ctxMax: 0 }),
				compact: () => { throw new Error("sync compact failed"); },
			},
			state,
		);
		assert.equal(result.ok, false);
		assert.equal(result.error, "sync compact failed");
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 10);
	});

	it("requestFold times out when native compact never completes", async () => {
		const state = makeState();
		state.engine.turnIndex = 9;
		const started = Date.now();
		const result = await m.requestFold(
			{ complete: async () => "unused" },
			{
				getContextUsage: () => ({ ctxMax: 0 }),
				compact: () => undefined,
			},
			state,
		);
		assert.equal(result.ok, false);
		assert.equal(typeof result.error, "string");
		assert.ok(result.error.length > 0);
		assert.equal(state.engine.compactCount, 1);
		assert.ok(Date.now() - started >= 450);
	});

	it("requestCompact invokes native compact and records the compaction", () => {
		const state = makeState();
		state.engine.turnIndex = 4;
		const notices = [];
		let compactCalls = 0;
		const ctx = {
			ui: { notify: (text, level) => notices.push({ text, level }) },
			compact: ({ onComplete }) => {
				compactCalls++;
				onComplete({ summary: "done" });
			},
		};

		const result = m.requestCompact(ctx, state);

		assert.deepEqual(result, { ok: true });
		assert.equal(compactCalls, 1);
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 4);
		assert.ok(notices.some((notice) => notice.level === "info"));
	});

	it("requestCompact records compact errors reported through onError and notifies", () => {
		const state = makeState();
		state.engine.turnIndex = 4;
		const notices = [];
		const result = m.requestCompact({
			ui: { notify: (text, level) => notices.push({ text, level }) },
			compact: ({ onError }) => onError(new Error("manual compact failed")),
		}, state);

		assert.deepEqual(result, { ok: true });
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 4);
		assert.equal(state.stats.compacts.at(-1).completed, false);
		assert.equal(state.stats.compacts.at(-1).errorKey, "engine.compactFailed");
		assert.ok(notices.some((notice) => notice.level === "error" && /manual compact failed/.test(notice.text)));
	});

	it("requestCompact returns an error when native compact is unavailable", () => {
		const state = makeState();
		const result = m.requestCompact({}, state);
		assert.equal(result.ok, false);
		assert.match(result.error, /compact/i);
		assert.equal(state.engine.compactCount, 0);
	});

	it("requestCompact returns an error when native compact throws", () => {
		const state = makeState();
		const result = m.requestCompact({ compact: () => { throw new Error("boom"); } }, state);
		assert.equal(result.ok, false);
		assert.equal(result.error, "boom");
		assert.equal(state.engine.compactCount, 0);
	});

	it("holdCompaction sets a hold window with default, custom, and zero turns", () => {
		const state = makeState();
		state.engine.turnIndex = 10;
		state.config.minTurnsBetweenCompacts = 3;

		m.holdCompaction(state);
		assert.equal(state.engine.holdUntilTurn, 13);
		assert.equal(state.engine.lastDecision, "hold");

		m.holdCompaction(state, 5);
		assert.equal(state.engine.holdUntilTurn, 15);

		m.holdCompaction(state, 0);
		assert.equal(state.engine.holdUntilTurn, 11);
	});

	it("handleTurnEnd flushes every-turn prune batches and rebuilds summarized context", async () => {
		const state = makeState();
		state.engine.turnIndex = 2;
		const notices = [];
		const toolContent = "export const x = 1;\n".repeat(80);
		const assistant = {
			role: "assistant",
			tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }],
		};
		const tool = { role: "tool", toolCallId: "tc-1", content: toolContent };
		const branch = [
			{ type: "message", turnIndex: 0, message: { role: "user", content: "inspect src/a.ts" } },
			{ type: "message", turnIndex: 0, message: assistant },
			{ type: "message", turnIndex: 0, message: tool },
		];
		const ctx = {
			signal: undefined,
			getContextUsage: () => ({ ratio: 0.2, hitRate: 0.95, ctxMax: 1000, maxTokens: 1000 }),
			sessionManager: { getBranch: async () => branch },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};
		const pi = {
			complete: async () => ({
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/a.ts; export x confirmed.\"}]}",
				usage: { input: 100, output: 20, cacheRead: 0 },
			}),
		};

		await m.autoHandleTurnEnd(pi, ctx, state, { message: assistant, toolResults: [tool] });

		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.toolIndexer.isSummarized("tc-1"));
		assert.ok(state.engine.prune.appliedIds.includes("tc-1"));
		assert.ok(notices.some((notice) => notice.level === "info"));
	});

	it("handleTurnEnd captures prune work but waits for final agent message in agent-message mode", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.turnIndex = 2;
		const assistant = {
			role: "assistant",
			tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }],
		};
		const tool = { role: "tool", toolCallId: "tc-1", content: "export const x = 1;" };
		const persisted = [];
		const ctx = {
			getContextUsage: () => ({ ratio: 0.2, ctxMax: 1000, maxTokens: 1000 }),
			sessionManager: { getBranch: async () => null },
			ui: { notify: () => assert.fail("should wait silently") },
		};

		await m.autoHandleTurnEnd({ appendEntry: (...args) => persisted.push(args) }, ctx, state, { message: assistant, toolResults: [tool] });

		assert.equal(state.engine.prune.pendingBatches.length, 1);
		assert.equal(state.engine.prune.batchStepCounter, 1);
		assert.equal(state.engine.prune.awaitingAgentMessage, true);
		assert.ok(persisted.length > 0);
		assert.equal(state.engine.prune.pruneRunCount, 0);
	});

	it("handleTurnEnd records auto-prune errors without breaking the context decision flow", async () => {
		const state = makeState();
		state.engine.turnIndex = 2;
		const notices = [];
		const ctx = {
			getContextUsage: () => ({ ratio: 0.2, ctxMax: 1000, maxTokens: 1000 }),
			sessionManager: { getBranch: async () => { throw new Error("branch unavailable"); } },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};

		await m.autoHandleTurnEnd({}, ctx, state, {});

		assert.equal(state.engine.prune.impact.lastErrorKey, "engine.prune.error.unexpected");
		assert.ok(notices.some((notice) => notice.level === "warning" && /branch unavailable/.test(notice.text)));
		assert.equal(state.engine.lastZone, "green");
	});

	it("handleTurnEnd honors active hold window except for force-fold decisions", async () => {
		const state = makeState();
		state.config.pruneEnabled = false;
		state.engine.turnIndex = 4;
		state.engine.holdUntilTurn = 10;
		let compactCalls = 0;
		const ctx = {
			getContextUsage: () => ({ ratio: 0.79, ctxMax: 1000, maxTokens: 1000, tokens: 790 }),
			compact: () => { compactCalls++; },
			ui: { notify: () => assert.fail("hold should suppress non-force notifications") },
		};

		await m.autoHandleTurnEnd({ complete: async () => "" }, ctx, state, {});

		assert.equal(compactCalls, 0);
		assert.equal(state.engine.lastDecision, "fold");
	});

	it("handleTurnEnd shows choice notification for orange zones without auto-folding", async () => {
		const state = makeState();
		state.config.pruneEnabled = false;
		state.config.autoFold = false;
		const notices = [];
		await m.autoHandleTurnEnd({}, {
			getContextUsage: () => ({ ratio: 0.73, ctxMax: 1000, maxTokens: 1000, tokens: 730 }),
			ui: { notify: (text, level) => notices.push({ text, level }) },
		}, state, {});

		assert.equal(state.engine.lastZone, "orange");
		assert.equal(state.engine.lastDecision, "advise");
		assert.ok(notices.some((notice) => notice.level === "warning" && /73%/.test(notice.text)));
	});

	it("handleTurnEnd leaves green hold decisions quiet", async () => {
		const state = makeState();
		state.config.pruneEnabled = false;
		const notices = [];
		await m.autoHandleTurnEnd({}, {
			getContextUsage: () => ({ ratio: 0.2, ctxMax: 1000, maxTokens: 1000, tokens: 200 }),
			ui: { notify: (text, level) => notices.push({ text, level }) },
		}, state, {});
		assert.equal(state.engine.lastZone, "green");
		assert.equal(state.engine.lastDecision, "hold");
		assert.deepEqual(notices, []);
	});

	it("handleTurnEnd warns and keeps pending work when prune summary request cannot run", async () => {
		const state = makeState();
		state.engine.turnIndex = 2;
		const notices = [];
		const assistant = {
			role: "assistant",
			tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }],
		};
		const tool = { role: "tool", toolCallId: "tc-1", content: "export const x = 1;" };
		const ctx = {
			signal: undefined,
			getContextUsage: () => ({ ratio: 0.2, ctxMax: 1000, maxTokens: 1000 }),
			sessionManager: { getBranch: async () => null },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};

		await m.autoHandleTurnEnd({}, ctx, state, { message: assistant, toolResults: [tool] });

		assert.equal(state.engine.prune.pendingBatches.length, 1);
		assert.equal(state.engine.prune.batchStepCounter, 1);
		assert.ok(notices.some((notice) => notice.level === "warning"));
		assert.equal(state.engine.prune.pruneRunCount, 0);
	});

	it("handleTurnEnd records oversized prune summaries as no-op diagnostics", async () => {
		const state = makeState();
		state.config.persistDiagnostics = true;
		state.engine.turnIndex = 2;
		const notices = [];
		const appended = [];
		const assistant = {
			role: "assistant",
			tool_calls: [{ id: "tc-oversized", function: { name: "read", arguments: "{\"path\":\"src/small.ts\"}" } }],
		};
		const tool = { role: "tool", toolCallId: "tc-oversized", content: "export const value = 1;" };
		const ctx = {
			signal: undefined,
			getContextUsage: () => ({ ratio: 0.2, ctxMax: 1000, maxTokens: 1000 }),
			sessionManager: { getBranch: async () => null },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};
		const pi = {
			appendEntry: (...args) => appended.push(args),
			complete: async () => ({
				content: JSON.stringify({
					summaries: [{
						batchIndex: 0,
						coverage: "complete",
						summary: "This summary is intentionally much longer than the tiny read result and should be treated as inefficient replacement text.",
					}],
				}),
				usage: { input: 20, output: 10, cacheRead: 0 },
			}),
		};

		await m.autoHandleTurnEnd(pi, ctx, state, { message: assistant, toolResults: [tool] });

		assert.equal(state.engine.prune.summarizedIds.includes("tc-oversized"), false);
		assert.equal(state.engine.prune.skippedOversizedIds.includes("tc-oversized"), true);
		assert.equal(state.engine.prune.impact.noOpToolCalls, 1);
		assert.equal(state.engine.prune.impact.lastNoOpToolCalls, 1);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.equal(state.engine.prune.batchStepCounter, 0);
		assert.ok(appended.length > 0);
		assert.ok(notices.some((notice) => notice.level === "warning" || notice.level === "info"));
	});

	it("handleAgentMessagePrune waits for threshold and final assistant reply", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 2 });
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "inspect src/a.ts",
			toolCalls: [{ id: "tc-1", name: "read", turnIndex: 0, args: "{\"path\":\"src/a.ts\"}", result: "export const x = 1;" }],
		}];
		state.engine.prune.batchStepCounter = 1;
		let called = false;
		await m.handleAgentMessagePrune(
			{ complete: async () => { called = true; return ""; } },
			{},
			state,
			{ message: { role: "assistant", content: "still thinking", tool_calls: [{ id: "tc-2", function: { name: "read", arguments: "{}" } }] } },
		);
		await m.handleAgentMessagePrune(
			{ complete: async () => { called = true; return ""; } },
			{},
			state,
			{ message: { role: "assistant", content: "done" } },
		);
		assert.equal(called, false);
		assert.equal(state.engine.prune.pendingBatches.length, 1);
	});

	it("handleAgentMessagePrune ignores disabled, wrong mode, non-assistant, and missing pending work", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.prune.batchStepCounter = 1;
		let called = false;
		const pi = { complete: async () => { called = true; return ""; } };

		state.config.enabled = false;
		await m.handleAgentMessagePrune(pi, {}, state, { message: { role: "assistant", content: "done" } });
		state.config.enabled = true;
		state.config.pruneEnabled = false;
		await m.handleAgentMessagePrune(pi, {}, state, { message: { role: "assistant", content: "done" } });
		state.config.pruneEnabled = true;
		state.config.pruneOn = "every-turn";
		await m.handleAgentMessagePrune(pi, {}, state, { message: { role: "assistant", content: "done" } });
		state.config.pruneOn = "agent-message";
		await m.handleAgentMessagePrune(pi, {}, state, { message: { role: "user", content: "done" } });
		await m.handleAgentMessagePrune(pi, {}, state, { role: "assistant", content: "done" });

		assert.equal(called, false);
	});

		it("handleAgentMessagePrune flushes pending batches on the final assistant message", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 2 });
		state.engine.turnIndex = 5;
		const toolContent = "export const x = 1;\n".repeat(80);
		state.engine.prune.batchStepCounter = 2;
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "inspect src/a.ts",
			toolCalls: [{ id: "tc-1", name: "read", turnIndex: 0, args: "{\"path\":\"src/a.ts\"}", result: toolContent }],
		}];
		const notices = [];
		const branch = [
			{ type: "message", turnIndex: 0, message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }] } },
			{ type: "message", turnIndex: 0, message: { role: "tool", toolCallId: "tc-1", content: toolContent } },
		];
		const ctx = {
			signal: undefined,
			sessionManager: { getBranch: async () => branch },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};
		const pi = {
			complete: async () => ({
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/a.ts; export x confirmed.\"}]}",
				usage: { input: 100, output: 20, cacheRead: 0 },
			}),
		};

		await m.handleAgentMessagePrune(pi, ctx, state, { message: { role: "assistant", content: "done" } });

		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.engine.prune.appliedIds.includes("tc-1"));
			assert.ok(notices.some((notice) => notice.level === "info"));
		});

		it("flushPendingPrune keeps agent-message cadence when summaries are unusable", async () => {
			const state = makeState();
			Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 3 });
			state.engine.turnIndex = 5;
			state.engine.prune.batchStepCounter = 3;
			state.engine.prune.pendingBatches = [{
				turnIndex: 0,
				context: "inspect src/no-summary.ts",
				toolCalls: [],
			}];
			const notices = [];
			const persisted = [];
			const ctx = {
				sessionManager: { getBranch: async () => [] },
				ui: { notify: (text, level) => notices.push({ text, level }) },
			};
			const pi = {
				appendEntry: (customType, data) => persisted.push({ customType, data }),
				complete: async () => ({ content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"partial\",\"summary\":\"\"}]}", usage: { input: 10, output: 1, cacheRead: 0 } }),
			};

			await m.flushPendingPrune(pi, ctx, state);

			assert.equal(state.engine.prune.batchStepCounter, 2);
			assert.equal(state.engine.prune.awaitingAgentMessage, false);
			assert.equal(notices.at(-1).level, "warning");
			assert.equal(persisted.some((entry) => entry.customType === "context-engine-telemetry"), true);
		});

		it("handleAgentMessagePrune ignores concurrent flush attempts while one summary request is running", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.turnIndex = 5;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "inspect src/race.ts",
			toolCalls: [{ id: "tc-race", name: "read", turnIndex: 0, args: "{\"path\":\"src/race.ts\"}", result: "export const race = true;\n".repeat(80) }],
		}];
		let completeCalls = 0;
		const branch = [
			{ type: "message", turnIndex: 0, message: { role: "assistant", tool_calls: [{ id: "tc-race", function: { name: "read", arguments: "{\"path\":\"src/race.ts\"}" } }] } },
			{ type: "message", turnIndex: 0, message: { role: "tool", toolCallId: "tc-race", content: "export const race = true;" } },
		];
		const ctx = {
			sessionManager: { getBranch: async () => branch },
			ui: { notify: () => {} },
		};
		const pi = {
			complete: async () => {
				completeCalls++;
				await new Promise((resolve) => setTimeout(resolve, 20));
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/race.ts; race export confirmed.\"}]}",
					usage: { input: 100, output: 20, cacheRead: 0 },
				};
			},
		};

		await Promise.all([
			m.handleAgentMessagePrune(pi, ctx, state, { message: { role: "assistant", content: "done" } }),
			m.handleAgentMessagePrune(pi, ctx, state, { message: { role: "assistant", content: "done" } }),
		]);

		assert.equal(completeCalls, 1);
		assert.equal(state.engine.prune.isFlushing, false);
		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.engine.prune.appliedIds.includes("tc-race"));
	});

	it("handleAgentMessagePrune keeps batches appended while a flush is already in flight", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.turnIndex = 5;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "read src/first.ts",
			toolCalls: [{ id: "tc-first", name: "read", turnIndex: 0, args: "{\"path\":\"src/first.ts\"}", result: "export const first = true;\n".repeat(80) }],
		}];
		const branch = [
			{ type: "message", turnIndex: 0, message: { role: "assistant", tool_calls: [{ id: "tc-first", function: { name: "read", arguments: "{\"path\":\"src/first.ts\"}" } }] } },
			{ type: "message", turnIndex: 0, message: { role: "tool", toolCallId: "tc-first", content: "export const first = true;" } },
		];
		const ctx = {
			sessionManager: { getBranch: async () => branch },
			ui: { notify: () => {} },
		};
		const pi = {
			complete: async () => {
				state.engine.prune.pendingBatches.push({
					turnIndex: 1,
					context: "read src/second.ts",
					toolCalls: [{ id: "tc-second", name: "read", turnIndex: 1, args: "{\"path\":\"src/second.ts\"}", result: "export const second = true;\n".repeat(80) }],
				});
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/first.ts; first export confirmed.\"}]}",
					usage: { input: 100, output: 20, cacheRead: 0 },
				};
			},
		};

		await m.handleAgentMessagePrune(pi, ctx, state, { message: { role: "assistant", content: "done" } });

		assert.equal(state.engine.prune.isFlushing, false);
		assert.ok(state.engine.prune.appliedIds.includes("tc-first"));
		assert.equal(state.engine.prune.appliedIds.includes("tc-second"), false);
		assert.equal(state.engine.prune.pendingBatches.length, 1);
		assert.equal(state.engine.prune.pendingBatches[0].toolCalls[0].id, "tc-second");
		assert.equal(state.engine.prune.awaitingAgentMessage, true);
		assert.equal(state.engine.prune.impact.pendingBatchesPreservedDuringFlush, 1);
		assert.equal(state.engine.prune.impact.pendingToolCallsPreservedDuringFlush, 1);
		assert.equal(state.engine.prune.impact.lastPendingBatchesPreservedDuringFlush, 1);
		assert.equal(state.engine.prune.impact.lastPendingToolCallsPreservedDuringFlush, 1);
	});

	it("handleAgentMessagePrune snapshots flushing batches and removes only flushed tool call ids", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.turnIndex = 5;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "read src/first.ts",
			toolCalls: [{ id: "tc-first", name: "read", turnIndex: 0, args: "{\"path\":\"src/first.ts\"}", result: "export const first = true;\n".repeat(80) }],
		}];
		const pi = {
			complete: async () => {
				state.engine.prune.pendingBatches[0].toolCalls.push({
					id: "tc-second",
					name: "read",
					turnIndex: 1,
					args: "{\"path\":\"src/second.ts\"}",
					result: "export const second = true;\n".repeat(80),
				});
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/first.ts; first export confirmed.\"}]}",
					usage: { input: 100, output: 20, cacheRead: 0 },
				};
			},
		};

		await m.handleAgentMessagePrune(pi, { ui: { notify: () => {} } }, state, { message: { role: "assistant", content: "done" } });

		assert.equal(state.engine.prune.pendingBatches.length, 1);
		assert.deepEqual(state.engine.prune.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-second"]);
		assert.equal(state.engine.prune.summarizedIds.includes("tc-first"), true);
		assert.equal(state.engine.prune.summarizedIds.includes("tc-second"), false);
		assert.equal(state.engine.prune.impact.pendingBatchesPreservedDuringFlush, 1);
		assert.equal(state.engine.prune.impact.pendingToolCallsPreservedDuringFlush, 1);
	});

	it("handleTurnEnd returns early when the extension is disabled", async () => {
		const state = makeState();
		state.config.enabled = false;
		state.engine.semanticFold.foldedThisTurn = true;
		await m.autoHandleTurnEnd({}, { ui: { notify: () => assert.fail("should not notify") } }, state, {});
		assert.equal(state.engine.semanticFold.foldedThisTurn, true);
	});

	it("handleTurnEnd triggers exit-with-summary fold without aborting the print run", async () => {
		const state = makeState();
		state.engine.turnIndex = 4;
		let aborted = false;
		const ctx = {
			getContextUsage: () => ({ ratio: 0.85, hitRate: 0.2, ctxMax: 100, maxTokens: 100, tokens: 85 }),
			sessionManager: { getBranch: async () => [
				{ id: "e3", message: { role: "assistant", content: "done" } },
				{ id: "e2", message: { role: "user", content: "please summarize" } },
				{ id: "e1", message: { role: "system", content: "system prompt" } },
			] },
			model: { id: "deepseek/deepseek-v4-flash" },
			ui: { notify: () => {} },
			abort: () => { aborted = true; },
		};

		await m.autoHandleTurnEnd({ complete: async () => "summary" }, ctx, state, {});

		assert.equal(aborted, false);
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.semanticFold.active, true);
	});

	it("lifecycle handleBeforeAgentStart triggers preflight fold and still injects cache prompt", async () => {
		const state = makeState();
		Object.assign(state.config, {
			cachePromptInjection: true,
			preflightFoldThreshold: 0.9,
		});
		state.engine.turnIndex = 3;
		let compactCalls = 0;
		const notices = [];
		const ctx = {
			getContextUsage: () => ({ ratio: 0.95, tokens: 950, ctxMax: 1000, maxTokens: 1000 }),
			ui: { notify: (text, level) => notices.push({ text, level }) },
			compact: ({ onComplete }) => {
				compactCalls++;
				onComplete({ summary: "native preflight compact" });
			},
		};

		const result = await m.lifecycleHandleBeforeAgentStart(
			{ complete: async () => "unused" },
			{ systemPrompt: "base prompt" },
			ctx,
			state,
		);

		assert.equal(compactCalls, 1);
		assert.equal(state.engine.compactCount, 1);
		assert.equal(state.engine.lastCompactTurn, 3);
		assert.ok(notices.some((notice) => notice.level === "warning"));
		assert.match(result.systemPrompt, /base prompt/);
		assert.match(result.systemPrompt, /\[Context Engine\]/);
	});

	it("lifecycle handleBeforeAgentStart skips preflight on first turn and avoids duplicate cache prompt", async () => {
		const state = makeState();
		state.engine.turnIndex = 0;
		state.config.cachePromptInjection = true;
		let compactCalls = 0;
		const ctx = {
			getContextUsage: () => ({ ratio: 0.99, tokens: 990, ctxMax: 1000, maxTokens: 1000 }),
			compact: () => { compactCalls++; },
		};

		const result = await m.lifecycleHandleBeforeAgentStart(
			{},
			{ systemPrompt: "base\n[Context Engine]\nalready present" },
			ctx,
			state,
		);

		assert.equal(compactCalls, 0);
		assert.equal(result, undefined);
	});

	it("lifecycle context projects active tool guidance without provider-payload nudge", async () => {
		const state = makeState();
		Object.assign(state.config, {
			toolIntentNudge: true,
			toolIntentNudgeMinConfidence: "medium",
			toolIntentNudgeMaxChars: 500,
		});
		state.engine.turnIndex = 4;

		await m.lifecycleHandleMessageEnd(
			{ message: { role: "assistant", content: "I will call read now." } },
			{},
			{},
			state,
		);

		assert.equal(state.engine.toolIntent.pending.length, 1);

		const entries = [];
		const pi = { appendEntry: (customType, data) => entries.push({ customType, data }) };
		const event = { messages: [{ role: "system", content: "base" }, { role: "user", content: "continue" }] };
		const result = await m.lifecycleHandleContext(event, { session: { id: "session-a" } }, state, pi);

		assert.equal(result.messages.length, 3);
		assert.equal(result.messages[2].role, "custom");
		assert.equal(result.messages[2].customType, "context-engine-guidance");
		assert.equal(result.messages[2].display, false);
		assert.match(result.messages[2].content, /(?:guidance|intent confirmation prompt)/);
		assert.match(result.messages[2].content, /tool-intent: imminent-tool-call/);
		assert.match(result.messages[2].content, /<!-- \/pi-context-engine: (?:guidance|intent confirmation prompt) -->/);
		assert.equal(entries.length, 1);
		assert.equal(entries[0].customType, "context-engine-guidance");
		assert.match(entries[0].data.content, /(?:guidance|intent confirmation prompt)/);
		assert.equal(entries[0].data.records.length, 1);

		const retry = { messages: [{ role: "system", content: "base" }] };
		await m.lifecycleHandleBeforeProviderRequest(retry, pi, { session: { id: "session-a" } }, state);
		assert.equal(retry.messages.length, 1);
		assert.equal(entries.length, 1);
	});

	it("input detects analyze intent and before_agent_start returns persistent custom guidance", async () => {
		const state = makeState();
		Object.assign(state.config, {
			toolIntentNudge: true,
			toolIntentNudgeMaxChars: 900,
		});
		const entries = [];
		const pi = { appendEntry: (customType, data) => entries.push({ customType, data }) };
		state.engine.toolIntent.lastUserIntent = { kind: "analyze", confidence: "high", reasonCode: "analysis_request" };
		state.engine.toolIntent.lastUserInputHash = "mocked-hash";

		const startResult = await m.lifecycleHandleBeforeAgentStart(
			pi,
			{ systemPrompt: "base", prompt: "проверь тесты" },
			{ getContextUsage: () => ({ ratio: 0.1, tokens: 10, ctxMax: 1000 }) },
			state,
		);

		assert.equal(state.engine.toolIntent.lastUserIntent.kind, "analyze");
		assert.ok(startResult?.systemPrompt);
		assert.equal(startResult.message.customType, "context-engine-guidance");
		assert.equal(startResult.message.display, false);
		assert.match(startResult.message.content, /(?:guidance|intent confirmation prompt)/);
		assert.match(startResult.message.content, /user-intent: analyz/);
		assert.match(startResult.message.content, /partial output/);
		assert.match(startResult.message.content, /\/pi-context-engine: (?:guidance|intent confirmation prompt)/);
		assert.equal(entries.length, 1);
		assert.equal(entries[0].customType, "context-engine-guidance");
		assert.equal(entries[0].data.records[0].kind, "user-intent");

		const event = { messages: [{ role: "system", content: "base" }, { role: "user", content: "проверь тесты" }] };
		await m.lifecycleHandleBeforeProviderRequest(event, pi, { session: { id: "session-user-intent" } }, state);
		assert.equal(event.messages.length, 2);

		const retry = { messages: [{ role: "system", content: "base" }] };
		await m.lifecycleHandleBeforeProviderRequest(retry, {}, { session: { id: "session-user-intent" } }, state);
		assert.equal(retry.messages.length, 1);
		assert.equal(entries.length, 1);
	});

	it("input captures raw user intent before context injection", async () => {
		const state = makeState();
		state.engine.toolIntent.lastUserIntent = { kind: "search", confidence: "high", reasonCode: "read_request" };

		const startResult = await m.lifecycleHandleBeforeAgentStart(
			{},
			{ prompt: "прочитай свежую tmp сессию", systemPrompt: "base" },
			{ getContextUsage: () => ({ ratio: 0.1, tokens: 10, ctxMax: 1000 }) },
			state,
		);

		assert.equal(state.engine.toolIntent.lastUserIntent.kind, "search");
		assert.ok(startResult?.systemPrompt);
		assert.equal(startResult.message.customType, "context-engine-guidance");
		assert.match(startResult.message.content, /user-intent: search/);
	});

	it("before_agent_start detects user intent from prompt when input hooks did not capture it", async () => {
		const state = makeState();
		Object.assign(state.config, {
			toolIntentNudge: true,
			toolIntentNudgeMaxChars: 900,
		});
		state.engine.toolIntent.lastUserIntent = { kind: "analyze", confidence: "high", reasonCode: "analysis_request" };
		state.engine.toolIntent.lastUserInputHash = "mocked-hash";

		const result = await m.lifecycleHandleBeforeAgentStart(
			{},
			{ systemPrompt: "base", prompt: "проверь тесты" },
			{ getContextUsage: () => ({ ratio: 0.1, tokens: 10, ctxMax: 1000 }) },
			state,
		);

		assert.equal(state.engine.toolIntent.lastUserIntent.kind, "analyze");
		assert.equal(result.message.customType, "context-engine-guidance");
		assert.match(result.message.content, /user-intent: analyz/);
	})

	it("before_provider_request injects provider-safe system guidance, not custom role", async () => {
		const state = makeState();
		Object.assign(state.config, {
			toolIntentNudge: true,
			toolIntentNudgeMaxChars: 900,
		});
		state.engine.toolIntent.lastUserIntent = { kind: "analyze", confidence: "high", reasonCode: "analysis_request" };
		state.engine.toolIntent.lastUserInputHash = "mocked-hash";

		const event = {
			messages: [
				{ role: "system", content: "base" },
				{ role: "user", content: "проверь тесты" },
			],
		};

		await m.lifecycleHandleBeforeProviderRequest(event, {}, { session: { id: "provider-safe-guidance" } }, state);

		assert.equal(event.messages.length, 3);
		assert.equal(event.messages[2].role, "system");
		assert.equal(event.messages.some((message) => message.role === "custom"), false);
		assert.match(event.messages[2].content, /(?:guidance|intent confirmation prompt)/);
		assert.match(event.messages[2].content, /user-intent: analyz/);
	});

	it("before_provider_request preserves tool-result adjacency by not appending system after tool", async () => {
		const state = makeState();
		Object.assign(state.config, {
			toolIntentNudge: true,
			toolIntentNudgeMaxChars: 900,
		});
		m.applyLocale("ru");
		try {
			m.lifecycleHandleInput({ text: "пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine" }, {}, state);
			const event = {
				messages: [
					{ role: "system", content: "base" },
					{ role: "user", content: "пожалуйста првоеди глубокий аудит покрытия тестами pi-context-engine" },
					{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
					{ role: "tool", tool_call_id: "tc-1", content: "result" },
				],
			};

			await m.lifecycleHandleBeforeProviderRequest(event, {}, { session: { id: "provider-tool-adjacency" } }, state);

			assert.equal(event.messages.length, 4);
			assert.equal(event.messages[event.messages.length - 1].role, "tool");
			assert.equal(event.messages.some((message, index) => index > 3 && message.role === "system"), false);
		} finally {
			m.applyLocale(undefined);
		}
	});

	it("before_provider_request fallback flushes agent-message prune and rewrites current payload", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneAgentMessageFallback: "before-provider", pruneBatchSize: 1 });
		state.engine.turnIndex = 3;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.awaitingAgentMessage = true;
		const toolContent = "export const fallback = true;\n".repeat(80);
		state.engine.prune.pendingBatches = [{
			turnIndex: 1,
			context: "read src/fallback.ts",
			toolCalls: [{ id: "tc-fallback", name: "read", turnIndex: 1, args: "{\"path\":\"src/fallback.ts\"}", result: toolContent }],
		}];
		const messages = [
			{ role: "system", content: "sys" },
			{ role: "assistant", tool_calls: [{ id: "tc-fallback", function: { name: "read", arguments: "{\"path\":\"src/fallback.ts\"}" } }] },
			{ role: "tool", toolCallId: "tc-fallback", content: toolContent },
		];
		const branch = messages.map((message, index) => ({ type: "message", id: `m${index}`, turnIndex: index, message }));
		let completeCalls = 0;
		const pi = {
			complete: async () => {
				completeCalls++;
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/fallback.ts; fallback export confirmed.\"}]}",
					usage: { input: 100, output: 20, cacheRead: 0 },
				};
			},
		};
		const event = { payload: { messages: [...messages] } };
		const notices = [];
		await m.lifecycleHandleBeforeProviderRequest(event, pi, {
			sessionManager: { getBranch: async () => branch },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		}, state);

		assert.equal(completeCalls, 1);
		assert.equal(state.engine.prune.awaitingAgentMessage, false);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.engine.prune.appliedIds.includes("tc-fallback"));
		assert.equal(event.payload.messages.some((msg) => msg.role === "tool" && msg.toolCallId === "tc-fallback"), false);
		assert.ok(event.payload.messages.some((msg) => JSON.stringify(msg).includes("fallback export confirmed")));
		assert.ok(notices.some((notice) => notice.level === "info"));
	});

	it("before_provider_request does not prune agent-message batches by default", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneAgentMessageFallback: "next-agent-start", pruneBatchSize: 1 });
		state.engine.turnIndex = 3;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.awaitingAgentMessage = true;
		const toolContent = "export const stillRaw = true;\n".repeat(80);
		state.engine.prune.pendingBatches = [{
			turnIndex: 1,
			context: "read src/still-raw.ts",
			toolCalls: [{ id: "tc-still-raw", name: "read", turnIndex: 1, args: "{\"path\":\"src/still-raw.ts\"}", result: toolContent }],
		}];
		let completeCalls = 0;
		const event = {
			payload: {
				messages: [
					{ role: "system", content: "sys" },
					{ role: "assistant", tool_calls: [{ id: "tc-still-raw", function: { name: "read", arguments: "{\"path\":\"src/still-raw.ts\"}" } }] },
					{ role: "tool", toolCallId: "tc-still-raw", content: toolContent },
				],
			},
		};

		await m.lifecycleHandleBeforeProviderRequest(event, { complete: async () => { completeCalls++; return ""; } }, {}, state);

		assert.equal(completeCalls, 0);
		assert.equal(state.engine.prune.awaitingAgentMessage, true);
		assert.equal(state.engine.prune.pendingBatches.length, 1);
		assert.ok(event.payload.messages.some((msg) => msg.role === "tool" && msg.toolCallId === "tc-still-raw"));
	});

	it("before_agent_start flushes pending agent-message prune at a user-turn boundary", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneAgentMessageFallback: "next-agent-start", pruneBatchSize: 1 });
		state.engine.turnIndex = 3;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.awaitingAgentMessage = true;
		const toolContent = "export const delayed = true;\n".repeat(80);
		state.engine.prune.pendingBatches = [{
			turnIndex: 1,
			context: "read src/delayed.ts",
			toolCalls: [{ id: "tc-delayed", name: "read", turnIndex: 1, args: "{\"path\":\"src/delayed.ts\"}", result: toolContent }],
		}];
		const branch = [
			{ type: "message", turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc-delayed", function: { name: "read", arguments: "{\"path\":\"src/delayed.ts\"}" } }] } },
			{ type: "message", turnIndex: 1, message: { role: "tool", toolCallId: "tc-delayed", content: toolContent } },
		];
		let completeCalls = 0;
		const notices = [];
		const pi = {
			complete: async () => {
				completeCalls++;
				return {
					content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/delayed.ts; delayed export confirmed.\"}]}",
					usage: { input: 100, output: 20, cacheRead: 0 },
				};
			},
		};

		await m.lifecycleHandleBeforeAgentStart(pi, { prompt: "next user request" }, {
			sessionManager: { getBranch: async () => branch },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		}, state);

		assert.equal(completeCalls, 1);
		assert.equal(state.engine.prune.awaitingAgentMessage, false);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.engine.prune.appliedIds.includes("tc-delayed"));
		assert.ok(notices.some((notice) => notice.level === "info"));
	});

	it("lifecycle handleMessageEnd flushes agent-message prune when event is the assistant message itself", async () => {
		const state = makeState();
		Object.assign(state.config, { pruneOn: "agent-message", pruneBatchSize: 1 });
		state.engine.turnIndex = 6;
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.pendingBatches = [{
			turnIndex: 0,
			context: "inspect src/a.ts",
			toolCalls: [{ id: "tc-direct", name: "read", turnIndex: 0, args: "{\"path\":\"src/a.ts\"}", result: "export const direct = true;\n".repeat(80) }],
		}];
		const notices = [];
		const branch = [
			{ type: "message", turnIndex: 0, message: { role: "assistant", tool_calls: [{ id: "tc-direct", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }] } },
			{ type: "message", turnIndex: 0, message: { role: "tool", toolCallId: "tc-direct", content: "export const direct = true;" } },
		];
		const ctx = {
			sessionManager: { getBranch: async () => branch },
			ui: { notify: (text, level) => notices.push({ text, level }) },
		};
		const pi = {
			complete: async () => ({
				content: "{\"summaries\":[{\"batchIndex\":0,\"coverage\":\"complete\",\"summary\":\"Read src/a.ts; direct export confirmed.\"}]}",
				usage: { input: 100, output: 20, cacheRead: 0 },
			}),
		};

		await m.lifecycleHandleMessageEnd({ role: "assistant", content: "done" }, pi, ctx, state);

		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(state.engine.prune.pendingBatches.length, 0);
		assert.ok(state.engine.prune.appliedIds.includes("tc-direct"));
		assert.ok(notices.some((notice) => notice.level === "info"));
	});

	it("normalizes custom provider messages and preserves existing array fold guidance", async () => {
		const state = makeState();
		state.engine.compactCount = 1;
		const event = {
			payload: {
				messages: [
					{ role: "user", content: "Keep working on the coverage task." },
					{ role: "custom", content: "Hidden custom context.", timestamp: 123 },
					{ role: "system", content: [{ type: "text", text: "<!-- pi-context-engine: fold guidance -->Already present.<!-- /pi-context-engine: fold guidance -->" }] },
				],
			},
		};

		await m.lifecycleHandleBeforeProviderRequest(event, {}, {}, state);

		assert.equal(event.payload.messages[1].role, "user");
		assert.deepEqual(event.payload.messages[1].content, [{ type: "text", text: "Hidden custom context." }]);
		const foldGuidanceCount = event.payload.messages.filter((message) => {
			const content = Array.isArray(message.content) ? message.content.map((part) => part.text ?? "").join("\n") : String(message.content ?? "");
			return content.includes("<!-- pi-context-engine: fold guidance -->");
		}).length;
		assert.equal(foldGuidanceCount, 1);
	});

	it("detects existing array fold guidance while ignoring non-text parts", async () => {
		const state = makeState();
		state.engine.compactCount = 1;
		const event = {
			payload: {
				messages: [
					{ role: "system", content: [{ type: "image", data: "x" }, { type: "text", text: "[pi-context-engine fold guidance]" }] },
					{ role: "user", content: "Continue with the current implementation state." },
				],
			},
		};

		await m.lifecycleHandleBeforeProviderRequest(event, {}, {}, state);

		const guidanceMessages = event.payload.messages.filter((message) => {
			const content = Array.isArray(message.content) ? message.content.map((part) => part.text ?? "").join("\n") : String(message.content ?? "");
			return content.includes("pi-context-engine fold guidance");
		});
		assert.equal(guidanceMessages.length, 1);
	});
});
});

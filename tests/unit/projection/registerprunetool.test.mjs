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

describe("registerPruneTool", () => {
  it("loads module and functions", async () => {
m.createToolCallIndexer = (await import("../../../src/projection/indexer.ts")).createToolCallIndexer;
m.createRuntimeState = (await import("../../../src/runtime-state.ts")).createRuntimeState;
{
	const mod = await import("../../../src/projection/prune-tool.ts");
	m.registerPruneTool = mod.registerPruneTool;
	m.executePrune = mod.executePrune;
	m.emitPruneSummaryMessage = mod.emitPruneSummaryMessage;
	m.syncPruneToolActivation = mod.syncPruneToolActivation;
}
    assert.ok(m.createToolCallIndexer);
  });

describe("registerPruneTool", () => {
	it("registers context_prune command", () => {
		const tools = [];
		const idx = m.createToolCallIndexer();
		m.registerPruneTool({ registerTool: (def) => tools.push(def) }, idx, { config: { locale: "en" } });
		assert.ok(tools.length > 0);
	});

	it("emits summary through session append fallback", () => {
		const calls = [];
		const ctx = {
			sessionManager: {
				appendCustomMessageEntry(customType, content, display, details) {
					calls.push({ customType, content, display, details, self: this });
				},
			},
		};

		m.emitPruneSummaryMessage({}, ctx, "Summary text", { batches: 1 });

		assert.equal(calls.length, 1);
		assert.equal(calls[0].content, "Summary text");
		assert.equal(calls[0].display, false);
		assert.equal(calls[0].self, ctx.sessionManager);
	});

	it("clears stale summarizer attempt when no unhandled tool calls are found", async () => {
		const state = m.createRuntimeState();
		state.engine.prune.impact.lastSummarizePrompt = "old prompt";
		state.engine.prune.impact.lastSummarizeResponse = "old response";
		state.engine.prune.impact.lastErrorKey = "old.error";
		state.engine.prune.summarizedIds.push("tc1");
		const appended = [];
		const pi = { appendEntry: (entry) => appended.push(entry) };
		const result = await m.executePrune(pi, {
			sessionManager: {
				getBranch: () => [
					{ turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }] } },
					{ turnIndex: 1, message: { role: "tool", tool_call_id: "tc1", content: "result" } },
				],
			},
		}, m.createToolCallIndexer(), state);

		assert.equal(result.details.reason, "none_found");
		assert.equal(state.engine.prune.impact.lastSummarizePrompt, undefined);
		assert.equal(state.engine.prune.impact.lastSummarizeResponse, undefined);
		assert.equal(state.engine.prune.impact.lastErrorKey, undefined);
		assert.ok(appended.length > 0);
	});

	it("handles non-string tool results and interactive mode", async () => {
		const result = await m.executePrune({}, {
			sessionManager: {
				getBranch: () => [
					{ turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc-json", function: { name: "read", arguments: "{\"path\":\"src/a.ts\"}" } }] } },
					{ turnIndex: 1, message: { role: "tool", tool_call_id: "tc-json", content: [{ type: "text", text: "result" }] } },
				],
			},
		}, m.createToolCallIndexer(), { config: { locale: "en" } }, "interactive");

		assert.ok(result.text.includes("read(tc-json)"));
		assert.deepEqual(result.details.toolCalls, ["read(tc-json)"]);
	});

	it("uses observation mask when replacement summary is too large", async () => {
		const state = m.createRuntimeState();
		state.config.pruneModel = "default";
		const result = await m.executePrune({
			complete: async () => ({
				content: JSON.stringify({ summaries: [{ batchIndex: 0, coverage: "complete", summary: "oversized ".repeat(2000) }] }),
				usage: { input: 10, output: 10, cacheRead: 0 },
			}),
		}, {
			sessionManager: {
				getBranch: () => [
					{ turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc-mask", function: { name: "read", arguments: "{\"path\":\"src/mask.ts\"}" } }] } },
					{ turnIndex: 1, message: { role: "tool", tool_call_id: "tc-mask", content: "export const mask = true;\n".repeat(500) } },
				],
			},
		}, m.createToolCallIndexer(), state);

		assert.equal(result.details.summarized, 1);
		assert.ok(state.engine.prune.summarizedIds.includes("tc-mask"));
		assert.match(state.engine.prune.summarizedRecords.at(-1).summaryText, /Tool output masked/);
	});

	it("ignores inactive tool-list sync when runtime is not initialized", () => {
		assert.doesNotThrow(() => m.syncPruneToolActivation({
			getActiveTools: () => { throw new Error("runtime not initialized"); },
			setActiveTools: () => {},
		}, { enabled: true, pruneOn: "agentic-auto" }));
	});
});
});

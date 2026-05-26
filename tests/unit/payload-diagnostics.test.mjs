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

describe("payload-diagnostics.ts", () => {
  it("loads module and functions", async () => {
m.inspectProviderPayload = (await import("../../src/payload-diagnostics.ts")).inspectProviderPayload;
m.formatPayloadDiagnostics = (await import("../../src/payload-diagnostics.ts")).formatPayloadDiagnostics;
    assert.ok(m.inspectProviderPayload);
  });

describe("inspectProviderPayload", () => {
	it("returns diagnostics for valid payload", () => {
		const circular = {};
		circular.self = circular;
		const diag = m.inspectProviderPayload({
			model: "deepseek-v4-flash",
			messages: [
				{ role: "assistant", content: [{ type: "toolCall" }] },
				{ role: "assistant", tool_calls: [{ id: "tc-1" }], reasoning_content: "reasoning" },
				{ role: "tool", tool_call_id: "tc-1", content: "result" },
				"not object",
			],
			tools: [{ name: "read" }],
			thinking: { type: "enabled" },
			reasoning_effort: "high",
			stream_options: { include_usage: false },
			prompt_cache_key: "key",
			circular,
		}, { requestIndex: 7 });
		assert.equal(diag.messageCount, 4);
		assert.equal(diag.toolCount, 1);
		assert.equal(diag.assistantMessages, 2);
		assert.equal(diag.assistantToolCallMessages, 2);
		assert.equal(diag.assistantMissingReasoningContent, 1);
		assert.equal(diag.toolResultMessages, 1);
		assert.equal(diag.lastMessageRole, "unknown");
		assert.equal(diag.promptCacheKey, true);
		assert.equal(diag.includeUsage, false);
		assert.equal(diag.requestIndex, 7);
	});
	it("handles undefined", () => {
		const diag = m.inspectProviderPayload(undefined);
		assert.ok(diag);
	});

	it("formats missing and populated diagnostics by keys and fallbacks", () => {
		const none = m.formatPayloadDiagnostics(undefined, {});
		assert.ok(none.length > 0);
		const diag = m.inspectProviderPayload({
			messages: [{ role: "tool", tool_call_id: "tc-2" }],
			stream_options: { include_usage: true },
		});
		const formatted = m.formatPayloadDiagnostics({ ...diag, requestIndex: undefined, tailRoles: undefined, lastMessageRole: undefined }, {});
		assert.ok(formatted.includes("request #?"));
		assert.ok(formatted.includes("tail=unknown"));
	});

	it("formats false booleans and absent optional fields", () => {
		const formatted = m.formatPayloadDiagnostics({
			createdAt: 1,
			messageCount: 0,
			toolCount: 0,
			payloadBytes: 0,
			promptCacheKey: false,
			assistantMessages: 0,
			assistantMissingReasoningContent: 0,
			assistantToolCallMessages: 0,
			toolResultMessages: 0,
			lastMessageRole: "tool",
			lastMessageHasToolCalls: false,
			lastMessageToolCallId: "tc-3",
			tailRoles: ["assistant", "tool"],
		}, {});
		assert.ok(formatted.includes("tc-3"));
		assert.ok(formatted.includes("assistant > tool"));
	});

	it("detects tool_use content parts and formats present cache/include flags", () => {
		const diag = m.inspectProviderPayload({
			messages: [{ role: "assistant", reasoning_content: "", content: [{ type: "tool_use" }] }],
			stream_options: { include_usage: true },
			prompt_cache_key: "cache-key",
		});
		assert.equal(diag.lastMessageHasToolCalls, true);
		assert.equal(diag.includeUsage, true);
		assert.equal(diag.promptCacheKey, true);
		const formatted = m.formatPayloadDiagnostics(diag, {});
		assert.ok(formatted.length > 0);
	});

	it("formats includeUsage=false branch explicitly", () => {
		const formatted = m.formatPayloadDiagnostics({
			createdAt: 1,
			messageCount: 0,
			toolCount: 0,
			payloadBytes: 0,
			includeUsage: false,
			promptCacheKey: false,
			assistantMessages: 0,
			assistantMissingReasoningContent: 0,
			assistantToolCallMessages: 0,
			toolResultMessages: 0,
			lastMessageRole: "unknown",
			lastMessageHasToolCalls: false,
			tailRoles: [],
		}, {});
		assert.ok(formatted.length > 0);
	});
});
});

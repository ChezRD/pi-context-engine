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

describe("batch-capture edge cases", () => {
  it("loads module and functions", async () => {
m.captureBatches = (await import("../../../src/projection/batch-capture.ts")).captureBatches;
m.messagesFromBranch = (await import("../../../src/projection/rebuild.ts")).messagesFromBranch;
m.collectPrunableToolResultIds = (await import("../../../src/projection/rebuild.ts")).collectPrunableToolResultIds;
m.rebuildPrunedContext = (await import("../../../src/projection/rebuild.ts")).rebuildPrunedContext;
m.rebuildPrunedContextFromSession = (await import("../../../src/projection/rebuild.ts")).rebuildPrunedContextFromSession;
m.createRuntimeState = (await import("../../../src/runtime-state.ts")).createRuntimeState;
m.buildSessionContentMap = (await import("../../../src/projection/session-map.ts")).buildSessionContentMap;
m.validateSessionPruneSuggestion = (await import("../../../src/projection/session-map.ts")).validateSessionPruneSuggestion;
m.stableHash = (await import("../../../src/cache-engine/prefix-fingerprint.ts")).stableHash;
m.computePinSetHash = (await import("../../../src/context-pins/store.ts")).computePinSetHash;
m.PinStore = (await import("../../../src/context-pins/store.ts")).PinStore;
m.persistPinEntry = (await import("../../../src/context-pins/store.ts")).persistPinEntry;
m.restorePinsFromSession = (await import("../../../src/context-pins/store.ts")).restorePinsFromSession;
    assert.ok(m.captureBatches);
  });

describe("captureBatches edge cases", () => {
	it("handles multi-turn tool sequences", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1", "tc-2"]);
	});
	it("deduplicates repeated tool calls", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result2" }, turnIndex: 1 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("skips non-tool messages in branch", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "user", content: "hi" }, turnIndex: 0 },
			{ message: { role: "assistant", content: "ok" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});

	it("ignores entries without messages and orphan tool results", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "orphan", content: "ignored" }, turnIndex: 0 },
			{ message: { role: "assistant", content: "plain" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});

	it("does not push batches when all calls are already skipped", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});

	it("requires a non-empty matching result before pushing at branch end", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [
				{ id: "tc-1", function: { name: "read" } },
				{ id: "tc-2", function: { name: "read" } },
			] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "   " }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-2"]);
	});

	it("keeps only the latest bridge context window and caps bridge text", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "r1" }, turnIndex: 0 },
			{ message: { role: "user", content: "old gap should fall out" }, turnIndex: 1 },
			{ message: { role: "assistant", content: "gap one " + "a".repeat(700) }, turnIndex: 2 },
			{ message: { role: "user", content: "gap two " + "b".repeat(700) }, turnIndex: 3 },
			{ message: { role: "assistant", content: "gap three " + "c".repeat(700) }, turnIndex: 4 },
			{ message: { role: "user", content: "gap four " + "d".repeat(700) }, turnIndex: 5 },
			{ message: { role: "assistant", content: "resume", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 6 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "r2" }, turnIndex: 6 },
		], [], pr, 6, { bridgeLength: 2 });
		assert.equal(pr.pendingBatches.length, 2);
		assert.equal(pr.pendingBatches[1].context.length, 1200);
		assert.doesNotMatch(pr.pendingBatches[1].context, /old gap should fall out/);
		assert.match(pr.pendingBatches[1].context, /resume/);
	});
});

describe("projection/rebuild", () => {
	it("messagesFromBranch skips prune-summary custom entries and normalizes non-array content", () => {
		const messages = m.messagesFromBranch([
			{ type: "message", message: { role: "user", content: "hi" } },
			{ type: "custom_message", customType: "context-engine-prune-summary", content: "skip me" },
			{ type: "custom_message", customType: "context-note", content: 42, timestamp: "2026-05-25T10:00:00.000Z" },
			{ type: "branch_summary", summary: { type: "text", text: "branch summary" }, timestamp: "2026-05-25T10:00:01.000Z" },
		]);

		assert.equal(messages.length, 3);
		assert.equal(messages[0].role, "user");
		assert.deepEqual(messages[1].content, [{ type: "text", text: "42" }]);
		assert.deepEqual(messages[2].content, [{ type: "text", text: "branch summary" }]);
	});

	it("collectPrunableToolResultIds returns only summarized tool result ids", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("tc-1", "read", 1, "summary");
		const ids = m.collectPrunableToolResultIds([
			{ role: "assistant", content: "plain" },
			{ role: "tool", toolCallId: "tc-1", content: "large 1" },
			{ role: "toolResult", tool_call_id: "tc-2", content: "large 2" },
		], state);
		assert.deepEqual(ids, ["tc-1"]);
	});

	it("rebuildPrunedContext removes summarized tool results and opens one prune checkpoint", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("tc-1", "read", 1, "summary text");
		const source = [
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "large result ".repeat(80) },
			{ role: "assistant", content: "after prune" },
		];

		const rebuild = m.rebuildPrunedContext(source, state, "manual prune", "engine.prune.rebuild.reason.manual");

		assert.equal(rebuild.changed, true);
		assert.deepEqual(rebuild.prunableIds, ["tc-1"]);
		assert.deepEqual(rebuild.newlyApplied, ["tc-1"]);
		assert.equal(rebuild.checkpointOpened, true);
		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(rebuild.messages.length, 2);
		assert.equal(rebuild.messages[0].role, "custom");
		assert.match(rebuild.messages[0].content[0].text, /context-engine-summary/);
		assert.match(rebuild.messages[0].content[0].text, /never reproduce, quote, or reference/);
		assert.match(rebuild.messages[0].content[0].text, /summary text/);
		assert.equal(rebuild.sourceMessages, 3);
		assert.equal(rebuild.outputMessages, 2);
		assert.equal(rebuild.savedApproxChars > 0, true);
		assert.equal(state.engine.prune.impact.lastRebuildSourceMessages, 3);
		assert.equal(state.engine.prune.impact.lastRebuildOutputMessages, 2);
		assert.equal(state.engine.prune.impact.lastRebuildPrunableIds, 1);
		assert.equal(state.engine.prune.impact.lastRebuildNewlyApplied, 1);
		assert.equal(state.engine.prune.impact.lastRebuildCheckpointOpened, true);
		assert.equal(state.engine.prune.impact.lastRebuildReasonKey, "engine.prune.rebuild.reason.manual");
	});

	it("rebuildPrunedContext is idempotent once summarized ids were already applied", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("tc-1", "read", 1, "summary text");
		state.engine.prune.appliedIds.push("tc-1");
		const source = [
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "large result" },
		];

		const rebuild = m.rebuildPrunedContext(source, state, "manual prune");

		assert.equal(rebuild.changed, true);
		assert.deepEqual(rebuild.newlyApplied, []);
		assert.equal(rebuild.checkpointOpened, false);
		assert.equal(state.engine.prune.pruneRunCount, 0);
	});

	it("rebuildPrunedContextFromSession uses session branch entries as its source", async () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("tc-1", "read", 1, "summary text");
		const rebuild = await m.rebuildPrunedContextFromSession({
			sessionManager: {
				getBranch: async () => [
					{ type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] } },
					{ type: "message", message: { role: "tool", toolCallId: "tc-1", content: "large result" } },
					{ type: "message", message: { role: "assistant", content: "done" } },
				],
			},
		}, state, "session prune");

		assert.equal(rebuild.changed, true);
		assert.deepEqual(rebuild.newlyApplied, ["tc-1"]);
		assert.equal(rebuild.messages.at(-1).content, "done");
	});
});

describe("projection/session-map", () => {
	it("returns an empty map for missing or irrelevant branch entries", () => {
		const state = m.createRuntimeState();
		const map = m.buildSessionContentMap([
			{ type: "custom_message", customType: "note", content: "ignored" },
			{ type: "message" },
			null,
		], state);
		assert.equal(map.version, 1);
		assert.deepEqual(map.nodes, []);
		assert.deepEqual(map.segments, []);
		assert.deepEqual(map.totals, {
			messages: 0,
			toolCalls: 0,
			toolResults: 0,
			lookups: 0,
			summarized: 0,
			dropCandidates: 0,
		});
	});

	it("maps dialogue, tool batches, summaries, parent links, and lookup metadata", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("lookup-1", "context_result_lookup", 2, "lookup summary");
		const map = m.buildSessionContentMap([
			{ id: "u1", type: "message", turnIndex: 1, message: { role: "user", content: [{ type: "text", text: "inspect" }, { type: "image", url: "ignored" }, " locales" ] } },
			{ id: "a1", type: "message", turnIndex: 2, message: { role: "assistant", content: "reading", tool_calls: [{ id: "lookup-1", function: { name: "context_result_lookup", arguments: "{\"ref\":\"dsc-1\",\"offset\":12,\"limit\":34}" } }] } },
			{ id: "t1", type: "message", turnIndex: 2, message: { role: "tool", toolCallId: "lookup-1", toolName: "context_result_lookup", details: { ref: "dsc-1", offset: 12, limit: 34 }, content: "slice data" } },
			{ id: "s1", type: "custom_message", customType: "context-engine-prune-summary", turnIndex: 2, content: "summarized lookup" },
			{ id: "a2", type: "message", turnIndex: 3, message: { role: "assistant", content: "done" } },
		], state);

		assert.equal(map.totals.messages, 3);
		assert.equal(map.totals.toolCalls, 1);
		assert.equal(map.totals.toolResults, 1);
		assert.equal(map.totals.lookups, 2);
		assert.equal(map.totals.summarized, 2);
		assert.equal(map.totals.dropCandidates, 2);
		assert.ok(map.segments.some((segment) => segment.kind === "dialogue" && !segment.dropCandidate));
		assert.ok(map.segments.some((segment) => segment.kind === "summary" && !segment.dropCandidate));
		assert.ok(map.segments.some((segment) => segment.kind === "tool-batch" && segment.dropCandidate));
		const toolSegment = map.segments.find((segment) => segment.kind === "tool-batch");
		assert.equal(toolSegment?.risk, "low");
		assert.deepEqual(toolSegment?.facts?.refs, ["dsc-1"]);
		assert.equal(toolSegment?.facts?.hasUnfetchedTail, false);
		assert.match(toolSegment?.summary ?? "", /context_result_lookup dsc-1/);

		const user = map.nodes.find((node) => node.role === "user");
		assert.equal(user?.textPreview, "inspect locales");
		const call = map.nodes.find((node) => node.kind === "tool-call");
		const result = map.nodes.find((node) => node.kind === "tool-result");
		assert.equal(call?.ref, "dsc-1");
		assert.equal(call?.offset, 12);
		assert.equal(call?.limit, 34);
		assert.equal(call?.argsHash, m.stableHash("{\"ref\":\"dsc-1\",\"offset\":12,\"limit\":34}"));
		assert.equal(call?.contentHash, m.stableHash({ name: "context_result_lookup", args: "{\"ref\":\"dsc-1\",\"offset\":12,\"limit\":34}" }));
		assert.equal(result?.parentNodeId, call?.id);
		assert.equal(result?.ref, "dsc-1");
		assert.equal(result?.resultHash, m.stableHash("slice data"));
		assert.equal(result?.contentHash, m.stableHash({ content: "slice data", result: undefined }));
	});

	it("keeps malformed lookup args unparsed and keeps mixed summarized batches non-droppable", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("lookup-1", "context_result_lookup", 1, "summary");
		const map = m.buildSessionContentMap([
			{ id: "a1", type: "message", turnIndex: 1, message: { role: "assistant", content: "mixed", tool_calls: [
				{ id: "lookup-1", function: { name: "context_result_lookup", arguments: "{not json" } },
				{ id: "read-1", function: { name: "read", arguments: "{\"path\":\"a.ts\"}" } },
			] } },
			{ id: "t1", type: "message", turnIndex: 1, message: { role: "toolResult", callId: "lookup-1", toolName: "context_result_lookup", content: "lookup body" } },
			{ id: "t2", type: "message", turnIndex: 1, message: { role: "tool", tool_call_id: "read-1", toolName: "read", result: "read body" } },
		], state);

		assert.equal(map.totals.toolCalls, 2);
		assert.equal(map.totals.toolResults, 2);
		assert.equal(map.totals.summarized, 2);
		assert.equal(map.totals.dropCandidates, 2);
		const lookup = map.nodes.find((node) => node.toolCallId === "lookup-1" && node.kind === "tool-call");
		assert.equal(lookup?.ref, undefined);
		assert.equal(lookup?.offset, undefined);
		assert.equal(lookup?.limit, undefined);
		const readResult = map.nodes.find((node) => node.toolCallId === "read-1" && node.kind === "tool-result");
		assert.equal(readResult?.textPreview, "read body");
		const batch = map.segments.find((segment) => segment.kind === "tool-batch");
		assert.equal(batch?.dropCandidate, false);
	});

	it("validates advisory model-directed prune suggestions without allowing unsafe drops", () => {
		const state = m.createRuntimeState();
		state.toolIndexer.markSummarized("lookup-1", "context_result_lookup", 1, "summary");
		const map = m.buildSessionContentMap([
			{ id: "u1", type: "message", turnIndex: 0, message: { role: "user", content: "inspect old output" } },
			{ id: "a1", type: "message", turnIndex: 1, message: { role: "assistant", content: "reading", tool_calls: [{ id: "lookup-1", function: { name: "context_result_lookup", arguments: "{\"ref\":\"dsc-old\",\"offset\":0,\"limit\":10}" } }] } },
			{ id: "t1", type: "message", turnIndex: 1, message: { role: "tool", toolCallId: "lookup-1", toolName: "context_result_lookup", content: "[context_result_lookup kind=slice ref=dsc-old offset=0 limit=10 returned_chars=10 total_chars=10 bytes=10 has_more=false]\nold slice" } },
			{ id: "u2", type: "message", turnIndex: 2, message: { role: "user", content: "continue" } },
			{ id: "a2", type: "message", turnIndex: 3, message: { role: "assistant", content: "fresh", tool_calls: [{ id: "read-1", function: { name: "read", arguments: "{\"path\":\"src/new.ts\"}" } }] } },
			{ id: "t2", type: "message", turnIndex: 3, message: { role: "tool", toolCallId: "read-1", toolName: "read", result: "fresh body" } },
		], state);

		const oldToolSegment = map.segments.find((segment) => segment.kind === "tool-batch" && segment.facts?.refs.includes("dsc-old"));
		const currentToolSegment = map.segments.find((segment) => segment.kind === "tool-batch" && segment.facts?.paths.includes("src/new.ts"));
		const userSegment = map.segments.find((segment) => segment.kind === "dialogue" && segment.nodeIds.some((id) => map.nodes.find((node) => node.id === id)?.role === "user"));

		assert.equal(oldToolSegment?.dropCandidate, true);
		assert.equal(currentToolSegment?.dropCandidate, false);
		assert.equal(currentToolSegment?.risk, "high");

		const validation = m.validateSessionPruneSuggestion(map, {
			dropSegmentIds: [oldToolSegment.id, currentToolSegment.id, userSegment.id, "missing"],
			reason: "model says old work is redundant",
		});

		assert.deepEqual(validation.acceptedSegmentIds, [oldToolSegment.id]);
		assert.deepEqual(validation.rejected.map((item) => item.reason), ["current-tail", "contains-user-message", "unknown-segment"]);
	});
});

describe("context pin store persistence helpers", () => {
	it("computePinSetHash is stable across record ordering and changes with content hash", () => {
		const r1 = { stableHash: "bbbb2222" };
		const r2 = { stableHash: "aaaa1111" };
		assert.equal(m.computePinSetHash([r1, r2]), m.computePinSetHash([r2, r1]));
		assert.notEqual(m.computePinSetHash([r1]), m.computePinSetHash([{ stableHash: "cccc3333" }]));
	});

	it("PinStore preserves metadata across set, restore, and engine pin conversion", () => {
		const store = new m.PinStore();
		assert.equal(store.set("skill", "review", "body", {
			scope: "project",
			priority: "high",
			source: "context-inferred",
			confidence: 0.8,
			sourcePath: "skills/review.md",
		}), true);
		const record = store.get("skill", "review", "project");
		assert.equal(record.priority, "high");
		assert.equal(record.source, "context-inferred");
		assert.equal(record.confidence, 0.8);
		assert.equal(record.sourcePath, "skills/review.md");

		const restored = new m.PinStore();
		restored.restore(record);
		assert.equal(restored.get("skill", "review", "project").stableHash, record.stableHash);
		assert.match(restored.toEnginePins()[0].raw, /context-engine-pin/);
	});

	it("persistPinEntry writes session custom entries and restorePinsFromSession accepts getEntries or getBranch", () => {
		const appended = [];
		const store = new m.PinStore();
		store.set("priority", "rule", "do not regress", { scope: "session" });
		const record = store.get("priority", "rule");
		m.persistPinEntry({ appendEntry: (type, data) => appended.push({ type, data }) }, record);
		m.persistPinEntry({}, record);

		assert.equal(appended.length, 1);
		assert.equal(appended[0].type, "context-engine-pin");
		assert.equal(appended[0].data.version, 1);

		const restoredFromEntries = new m.PinStore();
		const countEntries = m.restorePinsFromSession({ sessionManager: { getEntries: () => [
			{ type: "custom", customType: "context-engine-pin", data: appended[0].data },
			{ type: "custom", customType: "context-engine-pin", data: { version: 2, record } },
			{ type: "custom", customType: "other", data: appended[0].data },
		] } }, restoredFromEntries);
		assert.equal(countEntries, 1);
		assert.equal(restoredFromEntries.get("priority", "rule").content, "do not regress");

		const restoredFromBranch = new m.PinStore();
		const countBranch = m.restorePinsFromSession({ sessionManager: { getBranch: () => [
			{ type: "custom", customType: "context-engine-pin", data: appended[0].data },
		] } }, restoredFromBranch);
		assert.equal(countBranch, 1);
	});
});
});

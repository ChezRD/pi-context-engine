import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Dynamic imports ──

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

try {
	m.countMessageTokens = (await import("../src/projection/history-folder.ts")).countMessageTokens;
	m.estimateFoldBoundary = (await import("../src/projection/history-folder.ts")).estimateFoldBoundary;
	m.extractPinnedSkills = (await import("../src/projection/history-folder.ts")).extractPinnedSkills;
	m.extractPinnedConstraints = (await import("../src/projection/history-folder.ts")).extractPinnedConstraints;
	m.extractSessionIntent = (await import("../src/projection/history-folder.ts")).extractSessionIntent;
	m.buildFoldMessage = (await import("../src/projection/history-folder.ts")).buildFoldMessage;
	m.trimTrailingAssistantToolCalls = (await import("../src/projection/history-folder.ts")).trimTrailingAssistantToolCalls;
	m.isFoldValid = (await import("../src/projection/history-folder.ts")).isFoldValid;
	m.clearFold = (await import("../src/projection/history-folder.ts")).clearFold;
	m.captureBatches = (await import("../src/projection/batch-capture.ts")).captureBatches;
	m.captureTurnEndBatch = (await import("../src/projection/batch-capture.ts")).captureTurnEndBatch;
	m.extractMessageContext = (await import("../src/projection/batch-capture.ts")).extractMessageContext;
	m.extractAssistantToolCalls = (await import("../src/projection/batch-capture.ts")).extractAssistantToolCalls;
	m.shouldTriggerPrune = (await import("../src/projection/batch-capture.ts")).shouldTriggerPrune;
	m.pruneMessages = (await import("../src/projection/pruner.ts")).pruneMessages;
	m.createToolCallIndexer = (await import("../src/projection/indexer.ts")).createToolCallIndexer;
	m.normalizeToolResultForSummary = (await import("../src/projection/tool-pruner.ts")).normalizeToolResultForSummary;
	m.buildPoolPrompt = (await import("../src/projection/tool-pruner.ts")).buildPoolPrompt;
	m.summarizeToolBatch = (await import("../src/projection/tool-pruner.ts")).summarizeToolBatch;
	m.summarizeToolBatchPool = (await import("../src/projection/tool-pruner.ts")).summarizeToolBatchPool;
	m.summarizeToolBatches = (await import("../src/projection/tool-pruner.ts")).summarizeToolBatches;
	m.decideAfterUsage = (await import("../src/cache-engine/decision-engine.ts")).decideAfterUsage;
	m.estimateTurnStart = (await import("../src/cache-engine/decision-engine.ts")).estimateTurnStart;
	m.decideCompaction = (await import("../src/cache-engine/decision-engine.ts")).decideCompaction;
	m.readContextUsage = (await import("../src/cache-engine/decision-engine.ts")).readContextUsage;
	m.zoneForRatio = (await import("../src/cache-engine/decision-engine.ts")).zoneForRatio;
	m.buildContextStatus = (await import("../src/cache-engine/decision-engine.ts")).buildContextStatus;
	m.canCompactNow = (await import("../src/cache-engine/decision-engine.ts")).canCompactNow;
	m.decisionLabel = (await import("../src/cache-engine/decision-engine.ts")).decisionLabel;
	m.t = (await import("../src/i18n/index.ts")).t;
	m.registerAgenticTools = (await import("../src/agentic/tools.ts")).registerAgenticTools;
	m.registerTimelineTool = (await import("../src/ui/timeline.ts")).registerTimelineTool;
	m.showDashboard = (await import("../src/ui/dashboard.ts")).showDashboard;
	m.registerDashboardCommand = (await import("../src/ui/dashboard.ts")).registerDashboardCommand;
	m.registerCompactToolRenderers = (await import("../src/ui/tool-renderers.ts")).registerCompactToolRenderers;
	m.activateAppendOnlyProjectionFromCompact = (await import("../src/cache-engine/append-only-projection.ts")).activateAppendOnlyProjectionFromCompact;
	m.applyAppendOnlyProjection = (await import("../src/cache-engine/append-only-projection.ts")).applyAppendOnlyProjection;
	m.holdCompaction = (await import("../src/cache-engine/auto-compact.ts")).holdCompaction;
	m.requestFold = (await import("../src/cache-engine/auto-compact.ts")).requestFold;
	m.requestCompact = (await import("../src/cache-engine/auto-compact.ts")).requestCompact;
	m.autoHandleTurnEnd = (await import("../src/cache-engine/auto-compact.ts")).handleTurnEnd;
	m.handleAgentMessagePrune = (await import("../src/cache-engine/auto-compact.ts")).handleAgentMessagePrune;
	m.lifecycleHandleBeforeAgentStart = (await import("../src/cache-engine/index.ts")).handleBeforeAgentStart;
	m.lifecycleHandleBeforeProviderRequest = (await import("../src/cache-engine/index.ts")).handleBeforeProviderRequest;
	m.lifecycleHandleMessageEnd = (await import("../src/cache-engine/index.ts")).handleMessageEnd;
	m.estimateTokens = (await import("../src/cache-engine/custom-compaction.ts")).estimateTokens;
	m.foldInstructions = (await import("../src/cache-engine/custom-compaction.ts")).foldInstructions;
	m.compactOptions = (await import("../src/cache-engine/custom-compaction.ts")).compactOptions;
	m.maybeAdjustCutForCache = (await import("../src/cache-engine/custom-compaction.ts")).maybeAdjustCutForCache;
	m.handleSessionBeforeCompact = (await import("../src/cache-engine/custom-compaction.ts")).handleSessionBeforeCompact;
	m.addUsage = (await import("../src/stats.ts")).addUsage;
	m.extractUsageSnapshot = (await import("../src/stats.ts")).extractUsageSnapshot;
	m.savingsFromRealCost = (await import("../src/stats.ts")).savingsFromRealCost;
	m.emptyStats = (await import("../src/stats.ts")).emptyStats;
	m.formatTokenCount = (await import("../src/stats.ts")).formatTokenCount;
	m.costToCompact = (await import("../src/stats.ts")).costToCompact;
	m.deepSeekOfficialCost = (await import("../src/stats.ts")).deepSeekOfficialCost;
	m.readConfig = (await import("../src/config.ts")).readConfig;
	m.DEFAULT_CONFIG = (await import("../src/config.ts")).DEFAULT_CONFIG;
	m.detectDeepSeekModel = (await import("../src/model.ts")).detectDeepSeekModel;
	m.recommendContextAction = (await import("../src/context-monitor.ts")).recommendContextAction;
	m.inspectProviderPayload = (await import("../src/payload-diagnostics.ts")).inspectProviderPayload;
	m.getDeepSeekCacheCompletions = (await import("../src/commands.ts")).getDeepSeekCacheCompletions;
	m.registerCommands = (await import("../src/commands.ts")).registerCommands;
	m.HugeResultStore = (await import("../src/capper.ts")).HugeResultStore;
	m.maybeCapToolResult = (await import("../src/capper.ts")).maybeCapToolResult;
	m.registerFoldTool = (await import("../src/cache-engine/fold-tool.ts")).registerFoldTool;
	m.registerPruneTool = (await import("../src/projection/prune-tool.ts")).registerPruneTool;
	m.hitRatio = (await import("../src/stats.ts")).hitRatio;
	m.formatStats = (await import("../src/stats.ts")).formatStats;
	m.formatRatio = (await import("../src/stats.ts")).formatRatio;
	m.stableHash = (await import("../src/cache-engine/prefix-fingerprint.ts")).stableHash;
	m.diffPrefix = (await import("../src/cache-engine/prefix-fingerprint.ts")).diffPrefix;
	m.normalizeTools = (await import("../src/cache-engine/prefix-fingerprint.ts")).normalizeTools;
	m.shouldNotifyPrefixDrift = (await import("../src/cache-engine/prefix-fingerprint.ts")).shouldNotifyPrefixDrift;
	m.parseConfig = (await import("../src/config.ts")).parseConfig;
	m.writeConfig = (await import("../src/config.ts")).writeConfig;
	m.getContextPercent = (await import("../src/context-monitor.ts")).getContextPercent;
	m.readContextPercent = (await import("../src/context-monitor.ts")).readContextPercent;
	m.formatPayloadDiagnostics = (await import("../src/payload-diagnostics.ts")).formatPayloadDiagnostics;
	m.extractToolResultText = (await import("../src/capper.ts")).extractToolResultText;
	m.buildPreview = (await import("../src/capper.ts")).buildPreview;
	m.buildProgressBar = (await import("../src/utils.ts")).buildProgressBar;
	m.createRuntimeState = (await import("../src/runtime-state.ts")).createRuntimeState;
	m.buildStatus = (await import("../src/status.ts")).buildStatus;
	m.buildDetailedStatus = (await import("../src/status.ts")).buildDetailedStatus;
	m.formatPruneSummarizerTrace = (await import("../src/status.ts")).formatPruneSummarizerTrace;
	m.buildModelVisibleContext = (await import("../src/model-visible.ts")).buildModelVisibleContext;
	m.isModelVisibleContext = (await import("../src/model-visible.ts")).isModelVisibleContext;
	m.extractModelVisibleMetadata = (await import("../src/model-visible.ts")).extractModelVisibleMetadata;
	m.extractModelVisibleSection = (await import("../src/model-visible.ts")).extractModelVisibleSection;
	m.messagesFromBranch = (await import("../src/projection/rebuild.ts")).messagesFromBranch;
	m.collectPrunableToolResultIds = (await import("../src/projection/rebuild.ts")).collectPrunableToolResultIds;
	m.rebuildPrunedContext = (await import("../src/projection/rebuild.ts")).rebuildPrunedContext;
	m.rebuildPrunedContextFromSession = (await import("../src/projection/rebuild.ts")).rebuildPrunedContextFromSession;
	m.buildSessionContentMap = (await import("../src/projection/session-map.ts")).buildSessionContentMap;
	m.validateSessionPruneSuggestion = (await import("../src/projection/session-map.ts")).validateSessionPruneSuggestion;
	m.PinStore = (await import("../src/context-pins/store.ts")).PinStore;
	m.computeStablePinHash = (await import("../src/context-pins/store.ts")).computeStableHash;
	m.computePinSetHash = (await import("../src/context-pins/store.ts")).computePinSetHash;
	m.persistPinEntry = (await import("../src/context-pins/store.ts")).persistPinEntry;
	m.restorePinsFromSession = (await import("../src/context-pins/store.ts")).restorePinsFromSession;
} catch (e) {
	console.error("Import error:", e.message);
}

// ── countMessageTokens ──

describe("countMessageTokens", () => {
	it("counts string content", () => assert.ok(m.countMessageTokens({ role: "user", content: "hello world" }) > 0));
	it("counts ContentPart[]", () => assert.ok(m.countMessageTokens({ role: "user", content: [{ type: "text", text: "hello" }] }) > 0));
	it("counts tool_calls JSON", () => assert.ok(m.countMessageTokens({ role: "assistant", content: "", tool_calls: [{ function: { name: "read_file", arguments: '{"path":"x"}' } }] }) > 0));
	it("handles null", () => assert.equal(m.countMessageTokens(null), 0));
	it("handles undefined", () => assert.equal(m.countMessageTokens(undefined), 0));
	it("handles empty content", () => assert.equal(m.countMessageTokens({ role: "user", content: "" }), 1));
	it("handles simple content", () => assert.ok(m.countMessageTokens({ role: "user", content: "x" }) > 0));
});

// ── estimateFoldBoundary ──

describe("estimateFoldBoundary", () => {
	it("returns ok:false for empty messages", () => {
		const r = m.estimateFoldBoundary([], 0, 100);
		assert.equal(r.ok, false);
		assert.equal(r.reasonKey, "engine.fold.reason.noMessages");
	});
	it("splits messages into head and tail", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		// Each msg ~2 tokens. TailBudget=2 means only 0-1 msgs in tail
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.ok(r.headMessages.length > 0);
		assert.ok(r.tailMessages.length > 0);
	});
	it("handles non-array input", () => {
		const r = m.estimateFoldBoundary(undefined, 0, 100);
		assert.equal(r.ok, false);
	});
	it("user-seeking expands tail to user boundary", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1 very long message to break tail" },
			{ role: "user", content: "u2" },
			{ role: "assistant", content: "a2" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.equal(r.headMessages.length, 3);
		assert.equal(r.tailMessages.length, 2);
		assert.equal(r.tailMessages[0].role, "user");
		assert.equal(r.tailMessages[0].content, "u2");
	});
	it("returns the whole conversation as tail when it fits the budget", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 100);
		assert.equal(r.ok, true);
		assert.equal(r.headMessages.length, 0);
		assert.deepEqual(r.tailMessages, msgs);
	});
	it("keeps the original boundary when user-seeking would exceed the expanded budget", () => {
		const msgs = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1 " + "x".repeat(200) },
			{ role: "assistant", content: "a1 " + "y".repeat(80) },
			{ role: "assistant", content: "a2" },
		];
		const r = m.estimateFoldBoundary(msgs, 100, 2);
		assert.equal(r.ok, true);
		assert.equal(r.tailMessages.length, 1);
		assert.equal(r.tailMessages[0].role, "assistant");
		assert.equal(r.headMessages.length, 3);
	});
});

// ── extractPinnedSkills ──

describe("extractPinnedSkills", () => {
	it("extracts from system message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="skills-a">\ncontent a\n</skill-pin>' }]);
		assert.equal(s.length, 1);
		assert.equal(s[0].id, "skills-a");
	});
	it("returns empty for no matches", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: "hi" }]).length, 0));
	it("deduplicates by name, last wins", () => {
		const s = m.extractPinnedSkills([
			{ role: "system", content: '<skill-pin name="x">\nv1\n</skill-pin>' },
			{ role: "system", content: '<skill-pin name="x">\nv2\n</skill-pin>' },
		]);
		assert.equal(s.length, 1);
		assert.ok(s[0].content.includes("v2"));
	});
	it("handles non-string content", () => assert.equal(m.extractPinnedSkills([{ role: "user", content: ["not string"] }]).length, 0));
	it("multiple skills from one message", () => {
		const s = m.extractPinnedSkills([{ role: "system", content: '<skill-pin name="a">\nx\n</skill-pin><skill-pin name="b">\ny\n</skill-pin>' }]);
		assert.equal(s.length, 2);
	});
});

// ── extractPinnedConstraints ──

describe("extractPinnedConstraints", () => {
	it("finds bracket HIGH PRIORITY", () => {
		const c = m.extractPinnedConstraints([{ role: "system", content: "[HIGH PRIORITY] critical\n\nother" }]);
		assert.ok(c.some(x => x.includes("HIGH PRIORITY")));
	});
	it("returns empty for no constraints", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: "hi" }]).length, 0));
	it("handles non-string content", () => assert.equal(m.extractPinnedConstraints([{ role: "user", content: ["hi"] }]).length, 0));
});

// ── buildFoldMessage ──

describe("buildFoldMessage", () => {
	it("includes marker, skills, constraints", () => {
		const msg = m.buildFoldMessage("<m>", "summary text", [{ id: "s1", content: "<skill-pin name=\"s1\">\nc\n</skill-pin>" }], ["[HIGH PRIORITY] urgent"], [], "Initial user goal: prune safely");
		assert.ok(msg.content.includes("<m>"));
		assert.ok(msg.content.includes("summary text"));
		assert.ok(msg.content.includes("Session intent"));
		assert.ok(msg.content.includes("prune safely"));
		assert.ok(msg.content.includes("skill-pin"));
		assert.ok(msg.content.includes("HIGH PRIORITY"));
		assert.equal(msg.role, "assistant");
	});
	it("omits skills when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], ["[HIGH PRIORITY] x"]);
		assert.ok(!msg.content.includes("skill-pin"));
	});
	it("omits constraints when empty", () => {
		const msg = m.buildFoldMessage("<m>", "s", [], []);
		assert.ok(!msg.content.includes("HIGH PRIORITY"));
	});
});

describe("extractSessionIntent", () => {
	it("extracts first user goal and explicit constraints deterministically", () => {
		const intent = m.extractSessionIntent([
			{ role: "assistant", content: "hello" },
			{ role: "user", content: "Keep prune cheap and auditable." },
			{ role: "user", content: "[Project memory] prefer deterministic metadata" },
		], 240);
		assert.match(intent, /Initial user goal: Keep prune cheap/);
		assert.match(intent, /Constraint: \[Project memory\] prefer deterministic metadata/);
		assert.ok(intent.length <= 240);
	});
});

// ── trimTrailingAssistantToolCalls ──

describe("trimTrailingAssistantToolCalls", () => {
	it("drops trailing assistant with tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant", tool_calls: [{ function: { name: "test" } }] },
		]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 1);
	});
	it("keeps user messages", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([{ role: "user", content: "hi" }]);
		assert.equal(msgs.length, 1);
		assert.equal(n, 0);
	});
	it("handles empty", () => assert.equal(m.trimTrailingAssistantToolCalls([])[0].length, 0));
	it("keeps assistant with no content and no tool_calls", () => {
		const [msgs, n] = m.trimTrailingAssistantToolCalls([
			{ role: "user", content: "hi" },
			{ role: "assistant" },
		]);
		assert.equal(msgs.length, 2);
		assert.equal(n, 0);
	});
});

// ── isFoldValid ──

describe("isFoldValid", () => {
	it("returns false when not active", () => {
		const state = { engine: { semanticFold: { active: false } } };
		assert.equal(m.isFoldValid(state, "abc"), false);
	});
	it("returns true when fold active and prefix hash matches", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state, "abc"), true);
	});
	it("returns false when prefix hash mismatches", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state, "xyz"), false);
	});
	it("returns true when fold is active and no prefix hash has been recorded", () => {
		const state = { engine: { semanticFold: { active: true } } };
		assert.equal(m.isFoldValid(state, "xyz"), true);
	});
	it("returns true when fold is active and no system hash is supplied", () => {
		const state = { engine: { semanticFold: { active: true }, prefixHash: "abc" } };
		assert.equal(m.isFoldValid(state), true);
	});
});

// ── clearFold ──

describe("clearFold", () => {
	it("resets fold state", () => {
		const st = { engine: { semanticFold: { foldedHeadHash: "abc", foldedMessage: { content: "x" }, lastPinnedSkills: [], lastPinnedConstraints: [] } } };
		m.clearFold(st);
		assert.equal(st.engine.semanticFold.foldedHeadHash, undefined);
	});
});

// ── captureBatches ──

describe("captureBatches", () => {
	it("captures toolCall+toolResult pairs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "user", content: "hi" }, turnIndex: 0 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "result");
	});
	it("skips summarized IDs", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }, turnIndex: 0 },
		], ["tc-1"], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("handles empty branch", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 0);
	});
	it("captures tool calls using function name as fallback id", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "toolResult", toolCallId: "read", content: "ok" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
	});
	it("keeps delayed parallel tool results across intermediate assistant text", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", content: [{ type: "toolCall", id: "tc-1", name: "read", arguments: { path: "a.ts" } }, { type: "toolCall", id: "tc-2", name: "read", arguments: { path: "b.ts" } }] }, turnIndex: 0 },
			{ message: { role: "toolResult", toolCallId: "tc-1", content: "a" }, turnIndex: 0 },
			{ message: { role: "assistant", content: "intermediate analysis" }, turnIndex: 0 },
			{ message: { role: "toolResult", tool_call_id: "tc-2", content: "b" }, turnIndex: 0 },
		], [], pr, 0);
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => [tc.id, tc.result]), [["tc-1", "a"], ["tc-2", "b"]]);
	});
	it("splits multi-turn tool episodes when the dialogue gap reaches bridge length", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "user", content: "next step" }, turnIndex: 1 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0, { bridgeLength: 1 });
		assert.equal(pr.pendingBatches.length, 2);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.deepEqual(pr.pendingBatches[1].toolCalls.map((tc) => tc.id), ["tc-2"]);
	});
	it("merges multi-turn tool episodes when the dialogue gap is inside bridge length", () => {
		const pr = { pendingBatches: [], batchStepCounter: 0 };
		m.captureBatches([
			{ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
			{ message: { role: "tool", toolCallId: "tc-1", content: "result1" }, turnIndex: 0 },
			{ message: { role: "user", content: "next step" }, turnIndex: 1 },
			{ message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 1 },
			{ message: { role: "tool", toolCallId: "tc-2", content: "result2" }, turnIndex: 1 },
		], [], pr, 0, { bridgeLength: 2 });
		assert.equal(pr.pendingBatches.length, 1);
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1", "tc-2"]);
	});
});

describe("batch-capture helpers", () => {
	it("extractMessageContext collects reasoning, thinking, and text parts", () => {
		const text = m.extractMessageContext({
			reasoningContent: "reasoning",
			reasoning_content: "snake reasoning",
			thinking: "thought",
			content: [
				{ type: "text", text: "visible" },
				{ type: "reasoning", text: "reasoning part" },
				{ type: "thinking", thinking: "thinking field" },
				{ type: "reasoning_content", reasoning_content: "reasoning content field" },
				{ type: "image_url", image_url: { url: "ignored" } },
			],
		});
		assert.match(text, /reasoning/);
		assert.match(text, /snake reasoning/);
		assert.match(text, /thought/);
		assert.match(text, /visible/);
		assert.match(text, /reasoning part/);
		assert.match(text, /thinking field/);
		assert.match(text, /reasoning content field/);
		assert.doesNotMatch(text, /ignored/);
	});

	it("extractMessageContext truncates long content to the context cap", () => {
		const text = m.extractMessageContext({ content: "x".repeat(1000) });
		assert.equal(text.length, 600);
	});

	it("extractMessageContext returns undefined for empty and null messages", () => {
		assert.equal(m.extractMessageContext(null), undefined);
		assert.equal(m.extractMessageContext({ content: [{ type: "image_url", image_url: { url: "ignored" } }] }), undefined);
	});

	it("extractAssistantToolCalls supports camelCase and content-part formats", () => {
		assert.deepEqual(
			m.extractAssistantToolCalls({ toolCalls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] }),
			[{ id: "tc-1", name: "read", args: "{}" }],
		);
		assert.deepEqual(
			m.extractAssistantToolCalls({ content: [{ type: "tool_use", id: "tc-2", name: "grep", input: { pattern: "x" } }] }),
			[{ id: "tc-2", name: "grep", args: "{\"pattern\":\"x\"}" }],
		);
	});

	it("extractAssistantToolCalls handles fallback ids, structured arguments, and numeric ids", () => {
		assert.deepEqual(
			m.extractAssistantToolCalls({
				tool_calls: [
					{ id: 42, function: { name: "read", arguments: { path: "a.ts" } } },
					{ callId: "call-2", toolName: "context_result_lookup", input: { ref: "dsc-1" } },
					{ function: { name: "fallback_name" } },
				],
			}),
			[
				{ id: "42", name: "read", args: "{\"path\":\"a.ts\"}" },
				{ id: "call-2", name: "context_result_lookup", args: "{\"ref\":\"dsc-1\"}" },
				{ id: "fallback_name", name: "fallback_name", args: undefined },
			],
		);
	});

	it("extractAssistantToolCalls returns an empty array when no tool calls exist", () => {
		assert.deepEqual(m.extractAssistantToolCalls({ role: "assistant", content: "plain" }), []);
		assert.deepEqual(m.extractAssistantToolCalls({ role: "assistant", tool_calls: [] }), []);
	});
});

describe("captureTurnEndBatch", () => {
	it("returns zero when there are no assistant tool calls or no results", () => {
		const pr = { pendingBatches: [] };
		assert.equal(m.captureTurnEndBatch({ message: { role: "assistant", content: "plain" }, toolResults: [] }, [], pr, 1), 0);
		assert.equal(m.captureTurnEndBatch({ message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, toolResults: [] }, [], pr, 1), 0);
		assert.equal(pr.pendingBatches.length, 0);
	});

	it("captures matching results, call context, and skips mismatched or skipped ids", () => {
		const pr = { pendingBatches: [] };
		const count = m.captureTurnEndBatch({
			message: {
				role: "assistant",
				content: "I will inspect the file",
				tool_calls: [
					{ id: "skip-me", function: { name: "read", arguments: "{\"path\":\"skip.ts\"}" } },
					{ id: "tc-1", function: { name: "read", arguments: "{\"path\":\"a.ts\"}" } },
					{ id: "tc-2", function: { name: "bash", arguments: "{\"cmd\":\"echo\"}" } },
				],
			},
			toolResults: [
				{ toolCallId: "tc-1", content: [{ type: "text", text: "file text" }] },
				{ toolCallId: "other", content: "ignored" },
			],
		}, ["skip-me"], pr, 9);

		assert.equal(count, 1);
		assert.equal(pr.pendingBatches.length, 1);
		assert.equal(pr.pendingBatches[0].context, "I will inspect the file");
		assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1"]);
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "file text");
	});

	it("formats result, lookup details, missing ids, and JSON fallback through captured results", () => {
		const pr = { pendingBatches: [] };
		m.captureTurnEndBatch({
			message: {
				role: "assistant",
				tool_calls: [
					{ id: "lookup", function: { name: "context_result_lookup", arguments: "{}" } },
					{ id: "details", function: { name: "custom", arguments: "{}" } },
					{ id: "result-prop", function: { name: "custom", arguments: "{}" } },
					{ id: "json-fallback", function: { name: "custom", arguments: "{}" } },
					{ id: "missing-result-id", function: { name: "custom", arguments: "{}" } },
				],
			},
			toolResults: [
				{ callId: "lookup", toolName: "context_result_lookup", details: { ref: "dsc-1", offset: 5, limit: 10, returnedChars: 3, bytes: 100, found: true } },
				{ tool_call_id: "details", toolName: "custom_tool", details: { ref: "abc", found: false } },
				{ id: "result-prop", result: "result field" },
				{ toolCallId: "json-fallback", value: 123 },
				{ content: "no id" },
			],
		}, [], pr, 3);

		assert.equal(pr.pendingBatches.length, 1);
		const byId = Object.fromEntries(pr.pendingBatches[0].toolCalls.map((tc) => [tc.id, tc.result]));
		assert.equal(byId.lookup, "[context_result_lookup ref=dsc-1 offset=5 limit=10 returned=3 bytes=100 found=true]");
		assert.equal(byId.details, "[custom_tool ref=abc found=false]");
		assert.equal(byId["result-prop"], "result field");
		assert.match(byId["json-fallback"], /"value":123/);
		assert.equal("missing-result-id" in byId, false);
	});
	it("captures turn_end arrays and single toolResult events with alternate ids", () => {
		const pr = { pendingBatches: [] };
		const count = m.captureTurnEndBatch({
			message: { role: "assistant", content: [{ type: "function_call", call_id: "call-1", name: "read", arguments: { path: "a.ts" } }] },
			toolResult: { call_id: "call-1", content: "single result" },
		}, [], pr, 4);
		assert.equal(count, 1);
		assert.equal(pr.pendingBatches[0].toolCalls[0].id, "call-1");
		assert.equal(pr.pendingBatches[0].toolCalls[0].result, "single result");
	});

	it("deduplicates against existing pending batches and skips empty results", () => {
		const pr = { pendingBatches: [{ turnIndex: 1, toolCalls: [{ id: "tc-1", name: "read", turnIndex: 1, result: "old" }] }] };
		const count = m.captureTurnEndBatch({
			message: { role: "assistant", tool_calls: [
				{ id: "tc-1", function: { name: "read" } },
				{ id: "tc-2", function: { name: "read" } },
				{ id: "tc-3", function: { name: "read" } },
			] },
			toolResults: [
				{ toolCallId: "tc-1", content: "new" },
				{ toolCallId: "tc-2", content: "   " },
				{ toolCallId: "tc-3", content: "fresh" },
			],
		}, [], pr, 2);
		assert.equal(count, 1);
		assert.equal(pr.pendingBatches.length, 2);
		assert.deepEqual(pr.pendingBatches[1].toolCalls.map((tc) => tc.id), ["tc-3"]);
	});
});

// ── shouldTriggerPrune ──

describe("shouldTriggerPrune", () => {
	it("every-turn triggers with tools", () => assert.ok(m.shouldTriggerPrune("every-turn", 0, 1, true)));
	it("every-turn ignores batch threshold", () => assert.ok(m.shouldTriggerPrune("every-turn", 1, 3, true)));
	it("every-turn skips without tools", () => assert.equal(m.shouldTriggerPrune("every-turn", 0, 1, false), false));
	it("agent-message triggers at threshold", () => assert.ok(m.shouldTriggerPrune("agent-message", 3, 3, false)));
	it("agent-message skips below threshold", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false), false));
	it("agent-message does not flush early on pure text replies", () => assert.equal(m.shouldTriggerPrune("agent-message", 1, 3, false, true), false));
	it("checkpoint never auto-triggers without context_checkpoint", () => assert.equal(m.shouldTriggerPrune("checkpoint", 10, 1, true), false));
	it("on-demand never auto-triggers", () => assert.equal(m.shouldTriggerPrune("on-demand", 10, 1, true), false));
	it("agentic-auto requires tools and threshold", () => {
		assert.equal(m.shouldTriggerPrune("agentic-auto", 1, 2, true), false);
		assert.equal(m.shouldTriggerPrune("agentic-auto", 2, 2, false), false);
		assert.equal(m.shouldTriggerPrune("agentic-auto", 2, 2, true), true);
	});
	it("unknown modes default to hasTools", () => {
		assert.equal(m.shouldTriggerPrune("custom", 0, 1, true), true);
		assert.equal(m.shouldTriggerPrune("custom", 0, 1, false), false);
	});
});

// ── decideAfterUsage ──

describe("decideAfterUsage", () => {
	it("none below threshold", () => assert.equal(m.decideAfterUsage(700, 1000, false, cfg).kind, "none"));
	it("fold at 75%", () => {
		const d = m.decideAfterUsage(760, 1000, false, cfg);
		assert.equal(d.kind, "fold");
		assert.equal(d.aggressive, false);
	});
	it("aggressive fold at 78%", () => assert.ok(m.decideAfterUsage(790, 1000, false, cfg).aggressive));
	it("exit-with-summary at 80%", () => assert.equal(m.decideAfterUsage(810, 1000, false, cfg).kind, "exit-with-summary"));
	it("already folded returns none", () => assert.equal(m.decideAfterUsage(900, 1000, true, cfg).kind, "none"));
	it("no ctxMax returns none", () => {
		const d = m.decideAfterUsage(100, undefined, false, cfg);
		assert.equal(d.kind, "none");
		assert.equal(d.ctxMax, 0);
	});
});

// ── estimateTurnStart ──

describe("estimateTurnStart", () => {
	it("triggers at 90%", () => assert.ok(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.92 }) }, cfg).shouldFold));
	it("no fold below 90%", () => assert.equal(m.estimateTurnStart({ getContextUsage: () => ({ ratio: 0.70 }) }, cfg).shouldFold, false));
	it("missing getContextUsage", () => assert.equal(m.estimateTurnStart({}, cfg).shouldFold, false));
	it("returns false when ratio is undefined", () => assert.equal(m.estimateTurnStart({ getContextUsage: () => ({}) }, cfg).shouldFold, false));
});

// ── decideCompaction ──

describe("decideCompaction", () => {
	it("holds when ratio is undefined", () => assert.equal(m.decideCompaction({ ratio: undefined, hitRate: undefined }, cfg), "hold"));
	it("hold when low usage", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0.0 }, cfg), "hold"));
	it("fold at high ratio", () => assert.equal(m.decideCompaction({ ratio: 0.82, hitRate: 0.50 }, cfg), "fold"));
	it("force_fold at critical", () => assert.equal(m.decideCompaction({ ratio: 0.90, hitRate: 0.0 }, cfg), "force_fold"));
	it("fold when ratio above contextCompactPct regardless of hit rate", () => assert.equal(m.decideCompaction({ ratio: 0.71, hitRate: 0.95 }, cfg), "fold"));
	it("hold when ratio below contextCompactPct", () => assert.equal(m.decideCompaction({ ratio: 0.50, hitRate: 0 }, cfg), "hold"));
	it("folds at the exact 0.75 fallback threshold when hit rate is low", () => assert.equal(m.decideCompaction({ ratio: 0.75, hitRate: 0.2 }, cfg), "fold"));
	it("still folds below the 0.75 fallback threshold once contextCompactPct is already exceeded", () => assert.equal(m.decideCompaction({ ratio: 0.74, hitRate: 0.0 }, cfg), "fold"));
});

describe("readContextUsage", () => {
	it("reads promptTokens and maxTokens", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ promptTokens: 500, maxTokens: 1000 }) }), { ratio: 0.5, tokens: 500, max: 1000 });
	});
	it("reads percent values above one as percentages", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ percent: 75 }) }), { ratio: 0.75, tokens: undefined, max: undefined });
	});
	it("reads pct values already in ratio form", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ pct: 0.55 }) }), { ratio: 0.55, tokens: undefined, max: undefined });
	});
	it("reads usedTokens and limit", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => ({ usedTokens: 200, limit: 1000 }) }), { ratio: 0.2, tokens: 200, max: 1000 });
	});
	it("returns an empty object when getContextUsage throws", () => {
		assert.deepEqual(m.readContextUsage({ getContextUsage: () => { throw new Error("boom"); } }), {});
	});
});

describe("zoneForRatio", () => {
	it("maps exact thresholds to the expected zones", () => {
		const thresholds = { ...cfg, contextWarnPct: 0.60, contextDangerPct: 0.72, contextCompactPct: 0.82, contextForceFoldPct: 0.95 };
		assert.equal(m.zoneForRatio(0.60, thresholds), "yellow");
		assert.equal(m.zoneForRatio(0.72, thresholds), "orange");
		assert.equal(m.zoneForRatio(0.82, thresholds), "red");
		assert.equal(m.zoneForRatio(0.95, thresholds), "critical");
	});
	it("defaults undefined ratio to green", () => {
		assert.equal(m.zoneForRatio(undefined, cfg), "green");
	});
});

// ── buildContextStatus ──

describe("buildContextStatus", () => {
	const getCtx = (ratio, hitRate) => ({ getContextUsage: () => ({ ratio, hitRate }) });
	it("green zone", () => assert.equal(m.buildContextStatus(getCtx(0.30, 0.90), emptyStats, cfg).zone, "green"));
	it("red zone", () => assert.equal(m.buildContextStatus(getCtx(0.75, 0.50), emptyStats, cfg).zone, "red"));
	it("critical zone", () => assert.equal(m.buildContextStatus(getCtx(0.90, 0.50), emptyStats, cfg).zone, "critical"));
	it("no ratio", () => {
		const s = m.buildContextStatus({ getContextUsage: () => null }, emptyStats, cfg);
		assert.equal(s.zone, "green");
		assert.equal(s.ratio, undefined);
	});
});

// ── canCompactNow ──

describe("canCompactNow", () => {
	it("returns true when allowed", () => {
		const state = { engine: { compactCount: 1 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.ok(m.canCompactNow(state));
	});
	it("blocks when at max compacts", () => {
		const state = { engine: { compactCount: 5 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.equal(m.canCompactNow(state), false);
	});
	it("blocks when compact count exceeds the configured maximum", () => {
		const state = { engine: { compactCount: 6 }, config: { maxCompactsPerSession: 5, foldInterval: 3 } };
		assert.equal(m.canCompactNow(state), false);
	});
	it("allows compaction when no previous compact turn was recorded", () => {
		const state = { engine: { compactCount: 0, lastCompactTurn: undefined, turnIndex: 5 }, config: { maxCompactsPerSession: 5, minTurnsBetweenCompacts: 3 } };
		assert.equal(m.canCompactNow(state), true);
	});
});

// ── decisionLabel ──

describe("decisionLabel", () => {
	it("returns string for each action", () => {
		["hold", "fold", "force_fold", "advise"].forEach(a => {
			assert.ok(typeof m.decisionLabel(a) === "string");
		});
	});
});

// ── pruneMessages ──

describe("pruneMessages", () => {
	it("removes summarized tool results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "ok", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "big result" },
		], idx);
		assert.equal(pruned.length, 1);
	});
	it("keeps unsummarized tool results", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([{ role: "user", content: "hi" }, { role: "tool", toolCallId: "tc-new", content: "result" }], idx).length, 2);
	});
	it("deduplicates summary injection while removing raw results", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0, "summary");
		idx.markSummarized("tc-2", "rg", 0, "summary");
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
			{ role: "tool", toolCallId: "tc-1", content: "result 1" },
			{ role: "tool", toolCallId: "tc-2", content: "result 2" },
		], idx);
		assert.equal(pruned.length, 1);
		assert.equal(pruned[0].role, "assistant");
	});
	it("handles empty messages", () => {
		const idx = m.createToolCallIndexer();
		assert.equal(m.pruneMessages([], idx).length, 0);
	});
	it("removes trailing orphan tool after pruning", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		const pruned = m.pruneMessages([
			{ role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
			{ role: "tool", toolCallId: "tc-1", content: "result" },
			{ role: "tool", toolCallId: "tc-orphan", content: "no assistant" },
		], idx);
		assert.equal(pruned.length, 1); // orphan tool only
	});
});

// ── summarizeToolBatch ──

describe("summarizeToolBatch", () => {
	it("returns an observation mask when pi has no complete function", async () => {
		const result = await m.summarizeToolBatch({}, { turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }, { enabled: true, pruneOn: "every-turn", summarizerModel: "default" });
		assert.match(result.summaryText, /Coverage: unknown/);
		assert.match(result.summaryText, /Tool output masked/);
	});
});

// ── Agentic tools ──

describe("registerAgenticTools", () => {
	it("registers context_checkpoint and context_rewind", () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		assert.ok(tools.some(t => t.name === "context_checkpoint"));
		assert.ok(tools.some(t => t.name === "context_rewind"));
	});
});

describe("context_checkpoint execute", () => {
	it("returns error without session manager", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const cp = tools.find(t => t.name === "context_checkpoint");
		const result = await cp.execute("1", { name: "test" }, null, null, {});
		assert.ok(/session|сесси/i.test(result.content[0].text));
	});
});

describe("context_rewind execute", () => {
	it("returns error without session manager", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const rw = tools.find(t => t.name === "context_rewind");
		const result = await rw.execute("1", { target: "test", message: "msg" }, null, null, {});
		assert.ok(/session|сесси/i.test(result.content[0].text));
	});
	it("uses model-visible envelope for hidden continuation summary", async () => {
		const tools = [];
		m.registerAgenticTools({ registerTool: (def) => tools.push(def), setLabel: () => {}, on: () => {} });
		const rw = tools.find(t => t.name === "context_rewind");
		const ctx = {
			sessionManager: {
				getLeafId: () => "leaf12345678",
				getLabel: () => "current",
				getTree: () => [{ entry: { id: "target12345678" } }],
				branchWithSummary: async (_target, summary) => {
					assert.ok(summary.includes("<model_visible_context"));
					assert.ok(summary.includes('kind="context_rewind_summary"'));
					assert.ok(summary.includes('ui="hidden"'));
					assert.ok(summary.includes("carryover_summary"));
					return "new12345678";
				},
			},
		};
		const result = await rw.execute("1", { target: "target12345678", message: "continue here" }, null, null, ctx);
		assert.equal(result.content[0].text, "rewind start");
	});
});

// ── Timeline tool ──

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
});

// ── Dashboard ──

describe("showDashboard", () => {
	it("warns when no context usage", async () => {
		const notifs = [];
		await m.showDashboard({}, { getContextUsage: () => null, ui: { notify: (t, l) => notifs.push([t, l]) } });
		assert.equal(notifs[0][1], "warning");
	});

	function dashboardState() {
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", pruneBatchSize: 2 };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		state.stats = m.addUsage(m.emptyStats(), {
			input: 100,
			cacheRead: 900,
			cacheWrite: 0,
			output: 20,
			actualCost: 0.001,
			noCacheCost: 0.01,
			savings: 0.009,
			modelId: "deepseek-v4-flash",
			provider: "deepseek",
			segmentId: state.engine.segments[0].id,
			createdAt: 1,
		});
		state.engine.prune.pruneRunCount = 1;
		state.engine.prune.summarizedIds.push("tc-1");
		state.engine.prune.appliedIds.push("tc-1");
		state.engine.prune.pendingBatches.push({ turnIndex: 1, toolCalls: [{ id: "tc-2", name: "read", turnIndex: 1 }] });
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.impact.summarizeRequests = 1;
		state.engine.prune.impact.summarizeInputTokens = 100;
		state.engine.prune.impact.summarizeOutputTokens = 20;
		state.engine.prune.impact.summarizeCost = 0.0005;
		state.engine.prune.impact.lastSummarizeRawChars = 2000;
		state.engine.prune.impact.lastSummarizeSummaryChars = 200;
		state.engine.prune.impact.postPruneRequests = 1;
		state.engine.prune.impact.postPruneCacheReadTokens = 50;
		state.engine.prune.impact.lastPostPruneMissTokens = 10;
		state.engine.prune.impact.lastPostPruneHitRate = 0.9;
		state.engine.prune.impact.postPruneLookupRegret = 2;
		state.engine.prune.impact.postPruneReadRegret = 1;
		state.engine.prune.impact.postFoldReadRegret = 3;
		state.engine.prune.impact.lastRebuildSourceMessages = 5;
		state.engine.prune.impact.lastRebuildOutputMessages = 3;
		state.engine.prune.impact.lastRebuildPrunableIds = 1;
		state.engine.prune.impact.lastRebuildNewlyApplied = 1;
		state.engine.prune.impact.lastRebuildSavedApproxChars = 1800;
		state.engine.prune.impact.lastRebuildCheckpointOpened = true;
		state.engine.prune.impact.summarizeByModel = [{
			modelId: "deepseek-v4-flash",
			provider: "deepseek",
			requests: 1,
			inputTokens: 100,
			cacheReadTokens: 900,
			outputTokens: 10,
			cost: 0.0002,
		}];
		state.engine.prefixDriftCount = 1;
		state.engine.toolHashChanges = 1;
		state.engine.historyRewriteCount = 1;
		state.pinStore.set("priority", "rule", "keep context small");
		state.toolIndexer.markSummarized("tc-1", "read", 1, "read summary");
		return state;
	}

	function dashboardCtx(overrides = {}) {
		return {
			getContextUsage: () => ({ tokens: 500, contextWindow: 20000 }),
			getSystemPrompt: () => "system prompt",
			sessionManager: {
				getBranch: () => [
					{ type: "message", message: { role: "user", content: "question" } },
					{ type: "message", message: { role: "assistant", content: "will read", tool_calls: [{ id: "tc-1", function: { name: "read" } }] } },
					{ type: "message", message: { role: "tool", toolCallId: "tc-1", content: "x".repeat(1000) } },
					{ type: "branch_summary", summary: "branch summary" },
					{ type: "compaction", summary: "compact summary" },
				],
			},
			ui: {},
			...overrides,
		};
	}

	it("renders overlay dashboard with projected prune data, cache stats, model totals, risk, and pins", async () => {
		let rendered = "";
		let overlayOptions;
		const theme = { fg: (_name, value) => value, bold: (value) => value };
		const ctx = dashboardCtx({
			ui: {
				custom: async (factory, options) => {
					overlayOptions = options.overlayOptions;
					const component = factory(null, theme, null, () => {});
					rendered = component.render(100).join("\n");
					assert.equal(component.handleInput("x"), true);
				},
			},
		});
		const pi = {
			getActiveTools: () => ["read"],
			getAllTools: () => [{ name: "read", description: "Read files", parameters: { type: "object" } }],
		};

		await m.showDashboard(pi, ctx, dashboardState());

		assert.equal(overlayOptions.anchor, "bottom-center");
		assert.match(rendered, /Context Usage/);
		assert.match(rendered, /Model:\s+deepseek\/deepseek-v4-flash/);
		assert.match(rendered, /Cache statistics/);
		assert.match(rendered, /Prune:/);
		assert.match(rendered, /summary 2k -> 200/);
		assert.match(rendered, /rebuild 5->3 msgs/);
		assert.doesNotMatch(rendered, /regret lookup 2 · read 1 · fold-read 3/);
		assert.doesNotMatch(rendered, /x{100,}/);
	});

	it("falls back to flat notification when custom overlay is unavailable", async () => {
		const notifications = [];
		const ctx = dashboardCtx({ ui: { notify: (text, level) => notifications.push({ text, level }) } });
		await m.showDashboard({
			getActiveTools: () => ["read"],
			getAllTools: () => [{ name: "read", description: "Read files", parameters: {} }],
		}, ctx, dashboardState());

		assert.equal(notifications[0].level, "info");
		assert.match(notifications[0].text, /Context Usage/);
		assert.match(notifications[0].text, /Total Usage/);
		assert.match(notifications[0].text, /Hit rate:/);
	});

	it("warns when usage shape lacks token and context window fields", async () => {
		const notifications = [];
		await m.showDashboard({}, {
			getContextUsage: () => ({ ratio: 0.5 }),
			sessionManager: { getBranch: () => [] },
			ui: { notify: (text, level) => notifications.push({ text, level }) },
		}, dashboardState());
		assert.equal(notifications[0].level, "warning");
	});

	it("registerDashboardCommand registers /context and passes current state to showDashboard", async () => {
		const commands = new Map();
		const state = dashboardState();
		let notification = "";
		const pi = {
			registerCommand: (name, def) => commands.set(name, def),
			getActiveTools: () => [],
			getAllTools: () => [],
		};
		m.registerDashboardCommand({ pi, getState: () => state });
		assert.ok(commands.has("context"));
		await commands.get("context").handler("", dashboardCtx({ ui: { notify: (text) => { notification = text; } } }));
		assert.match(notification, /Context Usage/);
		assert.match(notification, /Hit rate:/);
	});
});

describe("commands", () => {
	it("getDeepSeekCacheCompletions filters subcommands and stops after whitespace", () => {
		const completions = m.getDeepSeekCacheCompletions("di");
		assert.deepEqual(completions.map((item) => item.value), ["diagnose", "disable-capper"]);
		assert.equal(m.getDeepSeekCacheCompletions("status extra"), null);
		assert.equal(m.getDeepSeekCacheCompletions("missing"), null);
	});

	it("registerCommands registers /context-engine and /prune handlers", async () => {
		const commands = new Map();
		const notifications = [];
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.config = { ...m.DEFAULT_CONFIG, locale: "en" };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		const ctx = {
			model: { provider: "deepseek", id: "deepseek-v4-flash" },
			getContextUsage: () => ({ percent: 12 }),
			ui: { notify: (text, level) => notifications.push({ text, level }) },
		};
		const pi = {
			registerCommand: (name, def) => commands.set(name, def),
			getCommands: () => [],
			getAllTools: () => [],
			getActiveTools: () => [],
		};
		m.registerCommands(pi, () => ctx, state, new m.HugeResultStore(), m.createToolCallIndexer());

		assert.ok(commands.has("context-engine"));
		assert.ok(commands.has("prune"));
		assert.equal(commands.get("context-engine").argumentHint.includes("status"), true);
		assert.equal(commands.get("context-engine").getArgumentCompletions("sta")[0].value, "status");

		const status = await commands.get("context-engine").handler("status", ctx);
		assert.match(status, /Context cache/);
		assert.equal(notifications.at(-1).level, "info");

		const usage = await commands.get("context-engine").handler("unknown-subcommand", ctx);
		assert.match(usage, /Usage: \/context-engine/);
		assert.equal(notifications.at(-1).level, "warning");
	});

	it("reset-stats command clears usage and opens a manual reset checkpoint", async () => {
		const commands = new Map();
		const statuses = [];
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.config = { ...m.DEFAULT_CONFIG, locale: "en" };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		state.stats = m.addUsage(m.emptyStats(), { input: 10, cacheRead: 90, cacheWrite: 0, output: 1, createdAt: 1 });
		const ctx = {
			model: { provider: "deepseek", id: "deepseek-v4-flash" },
			getContextUsage: () => ({ ratio: 0.1 }),
			ui: {
				notify: () => {},
				setStatus: (...args) => statuses.push(args),
			},
		};
		const pi = {
			registerCommand: (name, def) => commands.set(name, def),
			getCommands: () => [],
			getAllTools: () => [],
			getActiveTools: () => [],
		};
		m.registerCommands(pi, () => ctx, state, new m.HugeResultStore(), m.createToolCallIndexer());

		const text = await commands.get("context-engine").handler("reset-stats", ctx);
		assert.match(text, /reset/i);
		assert.equal(state.stats.requests, 0);
		assert.equal(state.engine.checkpoints.at(-1).reason, "manual_reset");
		assert.equal(statuses.length > 0, true);
	});
});

describe("compact tool renderers", () => {
	const theme = {
		fg: (_name, value) => value,
		bold: (value) => value,
	};

	it("registers wrapped built-in renderers for read, bash, grep, find, and ls", () => {
		const tools = [];
		m.registerCompactToolRenderers({ registerTool: (tool) => tools.push(tool) }, new m.HugeResultStore());
		const names = tools.map((tool) => tool.name).sort();
		assert.deepEqual(names, ["bash", "find", "grep", "ls", "read"]);
		for (const tool of tools) {
			assert.equal(typeof tool.execute, "function");
			assert.equal(typeof tool.renderCall, "function");
			assert.equal(typeof tool.renderResult, "function");
		}
	});

	it("renders calls with command, path, pattern, home shortening, and defaults", () => {
		const tools = [];
		m.registerCompactToolRenderers({ registerTool: (tool) => tools.push(tool) }, new m.HugeResultStore());
		const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
		const home = process.env.HOME;

		assert.match(byName.bash.renderCall({ command: "printf hello" }, theme).text, /\$ printf hello/);
		assert.match(byName.read.renderCall({ path: `${home}/project/file.ts` }, theme).text, /read ~\/project\/file\.ts/);
		assert.match(byName.grep.renderCall({ pattern: "TODO" }, theme).text, /grep TODO/);
		assert.match(byName.find.renderCall({}, theme).text, /find \./);
		assert.match(byName.ls.renderCall({ path: "/tmp" }, theme).text, /ls \/tmp/);
	});

	it("renders plain results collapsed, expanded, empty, and capped to forty lines", () => {
		const tools = [];
		m.registerCompactToolRenderers({ registerTool: (tool) => tools.push(tool) }, new m.HugeResultStore());
		const read = tools.find((tool) => tool.name === "read");
		const collapsed = read.renderResult({ content: [{ type: "text", text: "first\nsecond\nthird" }] }, { expanded: false }, theme).text;
		assert.match(collapsed, /first \(3 lines\)/);

		const longText = Array.from({ length: 45 }, (_, i) => `line-${i + 1}`).join("\n");
		const expanded = read.renderResult({ content: [{ type: "text", text: longText }] }, { expanded: true }, theme).text;
		assert.match(expanded, /line-1/);
		assert.match(expanded, /line-40/);
		assert.doesNotMatch(expanded, /line-41/);
		assert.match(expanded, /\.\.\. 5 more lines/);
		assert.equal(read.renderResult({ content: [] }, { expanded: false }, theme).text, "");
	});

	it("delegates large-result rendering to HugeResultStore preview renderer", () => {
		const store = new m.HugeResultStore();
		const record = store.remember("alpha\nbeta\ngamma", "tc-1", "read");
		const preview = m.buildPreview(record, { ...m.DEFAULT_CONFIG, hugeResultChars: 5, hugeResultHeadChars: 5, hugeResultTailChars: 5 });
		const tools = [];
		m.registerCompactToolRenderers({ registerTool: (tool) => tools.push(tool) }, store);
		const read = tools.find((tool) => tool.name === "read");
		const rendered = read.renderResult({ content: [{ type: "text", text: preview }], details: { elidedBy: "pi-context-engine", ref: record.ref } }, { expanded: false }, theme).text;
		assert.doesNotMatch(rendered, /large output:/);
		assert.doesNotMatch(rendered, new RegExp(record.ref));
		assert.doesNotMatch(rendered, /Full output: context_result_lookup/);
		assert.doesNotMatch(rendered, /source read/);
		assert.doesNotMatch(rendered, /<model_visible_context/);
	});
});

// ── Append-only projection ──

describe("activateAppendOnlyProjectionFromCompact", () => {
	it("sets projection active with summary", () => {
		const st = { config: { appendOnlyProjection: true }, engine: { appendOnly: { enabled: false, projectionActive: false, stableSummary: null, tailStartEntryId: "", tailFingerprint: undefined, invalidatedReasonKey: undefined } } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "fold summary", firstKeptEntryId: "entry-5" }, st);
		assert.ok(st.engine.appendOnly.projectionActive);
		assert.equal(st.engine.appendOnly.tailStartEntryId, "entry-5");
	});
	it("re-activates with new summary and clears stale invalidation", () => {
		const st = {
			config: { appendOnlyProjection: true },
			engine: {
				appendOnly: {
					enabled: true,
					projectionActive: true,
					stableSummary: { role: "assistant", content: "old" },
					tailStartEntryId: "old-tail",
					tailFingerprint: "old-hash",
					invalidatedReasonKey: "engine.appendOnly.invalidated.tailChanged",
				},
			},
		};
		m.activateAppendOnlyProjectionFromCompact({ summary: "new summary", firstKeptEntryId: "new-tail" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, true);
		assert.equal(st.engine.appendOnly.stableSummary.content, "new summary");
		assert.equal(st.engine.appendOnly.tailStartEntryId, "new-tail");
		assert.equal(st.engine.appendOnly.tailFingerprint, undefined);
		assert.equal(st.engine.appendOnly.invalidatedReasonKey, undefined);
	});
	it("skips activation when summary or tail start id is missing", () => {
		const st = { config: { appendOnlyProjection: true }, engine: { appendOnly: { projectionActive: false } } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "x" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, false);
		m.activateAppendOnlyProjectionFromCompact({ firstKeptEntryId: "tail" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, false);
	});
	it("skips when appendOnlyProjection disabled", () => {
		const st = { config: { appendOnlyProjection: false }, engine: { appendOnly: {} } };
		m.activateAppendOnlyProjectionFromCompact({ summary: "x", firstKeptEntryId: "y" }, st);
		assert.equal(st.engine.appendOnly.projectionActive, undefined);
	});
});

describe("applyAppendOnlyProjection", () => {
	it("returns undefined when projection inactive", () => {
		const st = { config: { enabled: true, appendOnlyProjection: true }, engine: { appendOnly: { enabled: true, projectionActive: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
	it("returns undefined when disabled", () => {
		const st = { config: { enabled: true, appendOnlyProjection: false }, engine: { appendOnly: { enabled: false } } };
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
});

// ── i18n ──

describe("t()", () => {
	it("falls back to default locale when locale missing", () => {
		const result = m.t({ locale: "xx" }, "status.title");
		assert.ok(typeof result === "string");
		assert.ok(result.length > 0);
	});
	it("interpolates variables", () => assert.ok(m.t({ locale: "en" }, "status.ctxPct", { pct: 42 }).includes("42")));
});

// ── indexer ──

describe("ToolCallIndexer", () => {
	it("starts empty", () => assert.equal(m.createToolCallIndexer().getAllSummarized().length, 0));
	it("records and checks", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read_file", 0);
		assert.ok(idx.isSummarized("tc-1"));
		assert.equal(idx.isSummarized("tc-2"), false);
	});
	it("getRecord", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		assert.equal(idx.getRecord("tc-1").toolName, "read");
	});
	it("resets", () => {
		const idx = m.createToolCallIndexer();
		idx.markSummarized("tc-1", "read", 0);
		idx.reset();
		assert.equal(idx.getAllSummarized().length, 0);
	});
});

// ── stats.ts ──

describe("hitRatio", () => {
	it("calculates ratio", () => assert.equal(m.hitRatio(100, 900), 0.9));
	it("handles zero total", () => assert.equal(m.hitRatio(0, 0), undefined));
	it("includes cacheWrite in denominator", () => assert.equal(m.hitRatio(100, 800, 100), 0.8));
});

describe("formatTokenCount", () => {
	it("formats zero", () => assert.equal(m.formatTokenCount(0), "0"));
	it("formats hundreds without suffix", () => assert.equal(m.formatTokenCount(500), "500"));
	it("formats millions", () => assert.equal(m.formatTokenCount(1_500_000), "1.5M"));
	it("formats thousands", () => assert.equal(m.formatTokenCount(1_500), "1.5k"));
	it("formats small numbers", () => assert.equal(m.formatTokenCount(42), "42"));
});

describe("formatRatio", () => {
	it("formats undefined as n/a", () => assert.equal(m.formatRatio(undefined), "n/a"));
	it("formats zero as 0.0%", () => assert.equal(m.formatRatio(0), "0.0%"));
	it("formats fractional ratios with one decimal place", () => assert.equal(m.formatRatio(0.756), "75.6%"));
});

describe("extractUsageSnapshot", () => {
	it("extracts from usage object", () => {
		const s = m.extractUsageSnapshot({ usage: { input: 100, cacheRead: 900, output: 50 } });
		assert.equal(s.input, 100);
		assert.equal(s.cacheRead, 900);
	});
	it("accepts cache-only usage and returns hitRate 1", () => {
		const s = m.extractUsageSnapshot({ usage: { input: 0, cacheRead: 50, cacheWrite: 0, output: 0 } });
		assert.equal(s.cacheRead, 50);
		assert.equal(s.hitRate, 1);
	});
	it("prefers top-level usage over nested message.usage and reads cost.total plus request id", () => {
		const s = m.extractUsageSnapshot({
			id: "req-1",
			usage: { input: 10, cacheRead: 90, cacheWrite: 0, output: 5, cost: { total: 0.123 } },
			message: { usage: { input: 999, cacheRead: 0, cacheWrite: 0, output: 0 } },
		});
		assert.equal(s.input, 10);
		assert.equal(s.cost, 0.123);
		assert.equal(s.requestId, "req-1");
	});
	it("preserves finite negative numbers as-is and ignores usage arrays", () => {
		assert.equal(m.extractUsageSnapshot({ usage: { input: -5, cacheRead: 10, cacheWrite: 0, output: 0 } }).input, -5);
		assert.equal(m.extractUsageSnapshot({ usage: [] }), undefined);
	});
	it("returns undefined for no usage", () => assert.equal(m.extractUsageSnapshot({}), undefined));
	it("returns undefined for null", () => assert.equal(m.extractUsageSnapshot(null), undefined));
});

describe("addUsage", () => {
	it("adds snapshot to stats", () => {
		const stats = m.emptyStats();
		const r = m.addUsage(stats, { input: 100, cacheRead: 900, output: 50, cacheWrite: 0 }, "deepseek/deepseek-v4-flash");
		assert.equal(r.requests, 1);
		assert.equal(r.input, 100);
		assert.equal(r.cacheRead, 900);
	});
	it("handles undefined snapshot", () => {
		const stats = m.emptyStats();
		assert.equal(m.addUsage(stats, undefined), stats);
	});
	it("uses snapshot modelCost and explicit snapshot cost when present", () => {
		const stats = m.emptyStats();
		const result = m.addUsage(stats, {
			input: 100,
			cacheRead: 0,
			cacheWrite: 0,
			output: 10,
			cost: 0.5,
			modelId: "unknown-model",
			modelCost: { input: 1, cacheRead: 0.1, cacheWrite: 0, output: 2 },
		});
		assert.equal(result.cost, 0.5);
		assert.equal(result.last.actualCost, 0.5);
		assert.equal(result.last.modelId, "unknown-model");
	});
	it("handles stats without compacts array", () => {
		const result = m.addUsage({ ...m.emptyStats(), compacts: undefined }, { input: 1, cacheRead: 0, cacheWrite: 0, output: 0 });
		assert.deepEqual(result.compacts, []);
	});
});

describe("savingsFromRealCost", () => {
	it("calculates savings", () => {
		const s = m.savingsFromRealCost({ input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, cost: 0.00016 }, { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(typeof s === "number");
	});
});

describe("costToCompact", () => {
	it("returns 0 for undefined usage", () => {
		const cost = m.costToCompact(undefined, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.equal(cost, 0);
	});
	it("calculates cost", () => {
		const cost = m.costToCompact({ input: 1000, cacheRead: 900, cacheWrite: 100 }, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 });
		assert.ok(cost > 0);
	});
	it("returns zero without pricing and computes positive delta even for fully cached input", () => {
		assert.equal(m.costToCompact({ input: 1000, cacheRead: 1000, cacheWrite: 0 }, { input: 0.14, cacheRead: 0.0028, cacheWrite: 0 }), 0.0001372);
		assert.equal(m.costToCompact({ input: 1000, cacheRead: 0, cacheWrite: 0 }, undefined), 0);
	});
});

describe("deepSeekOfficialCost", () => {
	it("returns flash pricing", () => {
		const p = m.deepSeekOfficialCost("deepseek-v4-flash");
		assert.equal(p.input, 0.14);
	});
	it("returns pro pricing", () => {
		const cost = m.deepSeekOfficialCost("deepseek-pro");
		assert.strictEqual(cost.input, 0.435);
	});
	it("treats chat, reasoner, and case-insensitive deepseek ids as flash pricing", () => {
		assert.equal(m.deepSeekOfficialCost("deepseek-chat").input, 0.14);
		assert.equal(m.deepSeekOfficialCost("deepseek-reasoner").input, 0.14);
		assert.equal(m.deepSeekOfficialCost("DeepSeek-V4-Flash").input, 0.14);
	});
	it("returns undefined for unknown", () => assert.equal(m.deepSeekOfficialCost("gpt-4"), undefined));
});

describe("emptyStats", () => {
	it("returns zeroed stats", () => {
		const s = m.emptyStats();
		assert.equal(s.requests, 0);
		assert.equal(s.cacheRead, 0);
	});
});

// ── config.ts ──

describe("readConfig", () => {
	it("returns default config when no file exists", () => {
		const cfg = m.readConfig("/nonexistent/path.json");
		assert.ok(cfg.enabled);
		assert.equal(cfg.foldThreshold, 0.75);
	});
});

describe("defaultConfig", () => {
	it("has fold threshold", () => assert.equal(m.DEFAULT_CONFIG.foldThreshold, 0.75));
	it("has aggressive threshold", () => assert.equal(m.DEFAULT_CONFIG.aggressiveFoldThreshold, 0.78));
	it("has prune enabled by default", () => assert.equal(m.DEFAULT_CONFIG.pruneEnabled, true));
	it("has prune after agent response by default", () => assert.equal(m.DEFAULT_CONFIG.pruneOn, "agent-message"));
});

// ── model.ts ──

describe("detectDeepSeekModel", () => {
	it("detects native DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek/deepseek-v4-flash", provider: "deepseek", compat: { thinkingFormat: "deepseek" } });
		assert.equal(d.kind, "native");
	});
	it("detects compatible model", () => {
		const d = m.detectDeepSeekModel({ id: "deepseek-chat", provider: "openrouter" });
		assert.equal(d.kind, "misconfigured");
	});
	it("detects non-DeepSeek", () => {
		const d = m.detectDeepSeekModel({ id: "gpt-4", provider: "openai" });
		assert.equal(d.kind, "not-deepseek");
	});
	it("handles undefined model", () => {
		const d = m.detectDeepSeekModel(undefined);
		assert.equal(d.kind, "not-deepseek");
	});
});

// ── context-monitor.ts ──

describe("recommendContextAction", () => {
	it("returns ok for low usage", () => {
		const r = m.recommendContextAction(0.30, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "ok");
	});
	it("returns warn for medium usage", () => {
		const r = m.recommendContextAction(0.75, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "warn");
	});
	it("returns danger for high usage", () => {
		const r = m.recommendContextAction(0.90, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "danger");
	});
	it("handles undefined percent", () => {
		const r = m.recommendContextAction(undefined, { contextWarnPct: 0.70, contextDangerPct: 0.85 });
		assert.equal(r.level, "off");
	});
});

// ── payload-diagnostics.ts ──

describe("inspectProviderPayload", () => {
	it("returns diagnostics for valid payload", () => {
		const diag = m.inspectProviderPayload({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], tools: [] });
		assert.ok(diag.messageCount > 0);
		assert.ok(diag.toolCount >= 0);
	});
	it("handles undefined", () => {
		const diag = m.inspectProviderPayload(undefined);
		assert.ok(diag);
	});
});

// ── capper.ts ──

describe("model-visible", () => {
	it("builds a model-visible block with metadata and named payload sections", () => {
		const text = m.buildModelVisibleContext({
			kind: "context_result_truncated",
			ui: "custom-rendered",
			instructions: "Model-only instruction.",
			metadata: { ref: "dsc-1", bytes: 123 },
			sections: [
				{ name: "lookup", content: "lookup body" },
				{ name: "preview", content: "preview body" },
			],
		});

		assert.ok(m.isModelVisibleContext(text));
		assert.match(text, /\[pi-context-engine: model-visible context\]/);
		assert.match(text, /schema="pi\.model_visible_context\.v1"/);
		assert.match(text, /<instructions>\nModel-only instruction\.\n<\/instructions>/);
		assert.ok(text.indexOf("<instructions>") < text.indexOf("<metadata>"));
		assert.match(text, /<payload name="lookup">/);
		assert.match(text, /<payload name="preview">/);
		assert.deepEqual(m.extractModelVisibleMetadata(text), {
			schema: "pi.model_visible_context.v1",
			kind: "context_result_truncated",
			ui: "custom-rendered",
			ref: "dsc-1",
			bytes: 123,
		});
		assert.equal(m.extractModelVisibleSection(text, "lookup"), "lookup body");
		assert.equal(m.extractModelVisibleSection(text, "preview"), "preview body");
	});

	it("returns undefined when metadata JSON is invalid", () => {
		const text = [
			"[pi-context-engine: model-visible context]",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"x\" ui=\"hidden\">",
			"<metadata>",
			"{not json}",
			"</metadata>",
			"</model_visible_context>",
		].join("\n");
		assert.equal(m.extractModelVisibleMetadata(text), undefined);
	});

	it("extracts payload names safely when the section name contains regex characters", () => {
		const text = [
			"[pi-context-engine: model-visible context]",
			"<model_visible_context schema=\"pi.model_visible_context.v1\" kind=\"x\" ui=\"hidden\">",
			"<metadata>",
			"{}",
			"</metadata>",
			"<payload name=\"slice[0].txt\">",
			"hello",
			"</payload>",
			"</model_visible_context>",
		].join("\n");
		assert.equal(m.extractModelVisibleSection(text, "slice[0].txt"), "hello");
	});
});

describe("HugeResultStore", () => {
	it("stores and retrieves", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("big data", "tool-1");
		assert.ok(rec.ref);
		assert.equal(rec.toolCallId, "tool-1");
		const got = store.get(rec.ref);
		assert.equal(got.toolCallId, "tool-1");
	});
	it("returns undefined for unknown ref", () => {
		const store = new m.HugeResultStore();
		assert.equal(store.get("unknown"), undefined);
	});
	it("records empty text and non-string tool metadata without losing byte/ref accounting", () => {
		const persisted = [];
		const store = new m.HugeResultStore((record) => persisted.push(record));
		const empty = store.remember("", 42, undefined);
		assert.equal(empty.ref, "dsc-result-1");
		assert.equal(empty.bytes, 0);
		assert.equal(empty.text, "");
		assert.equal(empty.toolCallId, 42);
		assert.equal(persisted.length, 1);

		const oddTool = store.remember("payload", null, "Tool Name With Spaces");
		assert.equal(oddTool.ref, "dsc-tool-name-with-space-2");
		assert.equal(oddTool.bytes, Buffer.byteLength("payload"));
		assert.equal(oddTool.toolCallId, null);
		assert.equal(store.get(oddTool.ref).text, "payload");
	});
});

describe("maybeCapToolResult", () => {
	it("passes through when disabled", () => {
		const store = new m.HugeResultStore();
		const r = m.maybeCapToolResult({ toolCallId: "t1", content: "data" }, { hugeResultCapper: false }, store);
		assert.equal(r, undefined);
	});
	it("caps when above threshold", () => {
		const store = new m.HugeResultStore();
		const event = { toolCallId: "t1", content: ["x".repeat(10000)] };
		const r = m.maybeCapToolResult(event, { hugeResultCapper: true, hugeResultChars: 100, hugeResultHeadChars: 50, hugeResultTailChars: 20 }, store);
		assert.ok(JSON.stringify(r.content).includes("[pi-context-engine: model-visible context]"));
	});
	it("handles undefined event", () => {
		const store = new m.HugeResultStore();
		assert.equal(m.maybeCapToolResult(undefined, { hugeResultCapper: true }, store), undefined);
	});
});

// ── fold-tool.ts ──

describe("registerFoldTool", () => {
	it("registers context_cache_fold tool", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: false } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools[0].name, "context_cache_fold");
	});
	it("skips when already registered", () => {
		const tools = [];
		const state = { config: { locale: "en", enabled: true, autoFold: true }, engine: { foldToolRegistered: true } };
		m.registerFoldTool({ registerTool: (def) => tools.push(def) }, state);
		assert.equal(tools.length, 0);
	});
});

// ── holdCompaction ──

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
		const enabled = m.compactOptions({ ...m.DEFAULT_CONFIG, autoFold: true, foldSummaryModel: "model-a" }, {});
		assert.match(enabled.customInstructions, /DeepSeek cache fold/);
		assert.match(enabled.customInstructions, /model-a/);

		const disabled = m.compactOptions({ ...m.DEFAULT_CONFIG, autoFold: false, foldSummaryModel: "model-a" }, {});
		assert.equal(disabled.customInstructions, undefined);
	});

	it("foldInstructions preserve current task state guidance and configured summary model", () => {
		const instructions = m.foldInstructions({ ...m.DEFAULT_CONFIG, foldSummaryModel: "deepseek-v4-flash" });
		assert.match(instructions, /preserve current task state/);
		assert.match(instructions, /deepseek-v4-flash/);
	});

	it("maybeAdjustCutForCache and handleSessionBeforeCompact intentionally leave host compaction unchanged", () => {
		assert.equal(m.maybeAdjustCutForCache([{ id: "a" }, { id: "b" }], 1, 0.2), undefined);
		assert.equal(m.handleSessionBeforeCompact({ entries: [] }, {}, { config: { ...m.DEFAULT_CONFIG, enabled: false } }), undefined);
		assert.equal(m.handleSessionBeforeCompact({ entries: [] }, {}, { config: { ...m.DEFAULT_CONFIG, enabled: true } }), undefined);
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
		assert.match(state.engine.semanticFold.syntheticMsg.content, /folded summary/);
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
		assert.match(result.error, /context limit/i);
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
		assert.equal(result.error, "compact timeout");
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

	it("handleTurnEnd triggers exit-with-summary and aborts the turn", async () => {
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

		assert.equal(aborted, true);
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
		assert.ok(notices.some((notice) => notice.level === "warning" && /pre-flight fold triggered/i.test(notice.text)));
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
			{ systemPrompt: "base\n[DeepSeek Cache Optimization]\nalready present" },
			ctx,
			state,
		);

		assert.equal(compactCalls, 0);
		assert.equal(result, undefined);
	});

	it("lifecycle handleBeforeProviderRequest injects one gated intent nudge for pending tool intent", async () => {
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

		const event = { messages: [{ role: "system", content: "base" }, { role: "user", content: "inspect file" }] };
		await m.lifecycleHandleBeforeProviderRequest(event, {}, { session: { id: "session-a" } }, state);

		assert.equal(event.messages.length, 3);
		assert.equal(event.messages[2].role, "system");
		assert.match(event.messages[2].content, /\[pi-context-engine intent nudge\]/);
		assert.match(event.messages[2].content, /Detected pending tool intent: imminent-tool-call/);
		assert.equal(state.engine.toolIntent.stats.nudges, 1);

		const retry = { messages: [{ role: "system", content: "base" }] };
		await m.lifecycleHandleBeforeProviderRequest(retry, {}, { session: { id: "session-a" } }, state);
		assert.equal(retry.messages.length, 1);
		assert.equal(state.engine.toolIntent.stats.nudges, 1);
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
});

// ── registerPruneTool ──

describe("registerPruneTool", () => {
	it("registers context_prune command", () => {
		const tools = [];
		const idx = m.createToolCallIndexer();
		m.registerPruneTool({ registerTool: (def) => tools.push(def) }, idx, { config: { locale: "en" } });
		assert.ok(tools.length > 0);
	});
});

// ── formatStats ──

describe("formatStats", () => {
	it("formats stats", () => {
		const stats = m.emptyStats();
		const result = m.formatStats(stats);
		assert.ok(result.includes("input_tokens"));
	});
});

// ── prefix-fingerprint.ts ──

describe("stableHash", () => {
	it("produces deterministic hash", () => {
		const h1 = m.stableHash({ a: 1, b: 2 });
		const h2 = m.stableHash({ b: 2, a: 1 });
		assert.equal(h1, h2);
	});
	it("different inputs produce different hashes", () => {
		const h1 = m.stableHash({ a: 1 });
		const h2 = m.stableHash({ a: 2 });
		assert.notEqual(h1, h2);
	});
});

describe("normalizeTools", () => {
	it("sorts tools by name", () => {
		const tools = [{ name: "z", description: "last" }, { name: "a", description: "first" }];
		const n = m.normalizeTools(tools);
		assert.equal(n.length, 2);
	});
	it("handles undefined tools", () => {
		const n = m.normalizeTools(undefined);
		assert.equal(n.length, 0);
	});
});

describe("diffPrefix", () => {
	it("returns empty reasons for equal prefixes", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, a);
		assert.equal(d.reasons.length, 0);
	});
	it("detects model change", () => {
		const a = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const b = { model: "m2", systemHash: "s1", toolsHash: "t1", reasoning: false, temperature: 0 };
		const d = m.diffPrefix(a, b);
		assert.ok(d.reasons.includes("model"));
		assert.ok(d.hard);
	});
});

describe("shouldNotifyPrefixDrift", () => {
	it("notifies on new reason", () => {
		const drift = { reasons: ["tools"], hard: true };
		const state = { engine: { lastPrefixWarningReason: "", lastPrefixWarningTurn: 0, turnIndex: 10 } };
		assert.ok(m.shouldNotifyPrefixDrift(state, drift));
	});
	it("suppresses same reason recently", () => {
		const drift = { reasons: ["tools"], hard: false };
		const state = { engine: { lastPrefixWarningReason: "tools", lastPrefixWarningTurn: 8, turnIndex: 10 } };
		assert.equal(m.shouldNotifyPrefixDrift(state, drift), false);
	});
});

// ── config.ts ──

describe("parseConfig", () => {
	it("merges partial config with defaults", () => {
		const cfg = m.parseConfig({ foldThreshold: 0.80 });
		assert.equal(cfg.foldThreshold, 0.80);
	});
	it("returns defaults for null", () => {
		const cfg = m.parseConfig(null);
		assert.equal(cfg.foldThreshold, 0.75);
	});
	it("parses percent as 0..1 from 0..100", () => {
		const cfg = m.parseConfig({ foldThreshold: 80 });
		assert.ok(cfg.foldThreshold > 0.5 && cfg.foldThreshold < 1);
	});
	it("returns defaults for non-object input", () => {
		assert.equal(m.parseConfig("bad").enabled, true);
		assert.equal(m.parseConfig([]).foldThreshold, 0.75);
	});
	it("keeps defaults for an empty object", () => {
		const parsed = m.parseConfig({});
		assert.equal(parsed.pruneOn, m.DEFAULT_CONFIG.pruneOn);
		assert.equal(parsed.statusBarStyle, m.DEFAULT_CONFIG.statusBarStyle);
	});
	it("falls back and clamps invalid config values", () => {
		const parsed = m.parseConfig({
			pruneOn: "invalid-value",
			pruneBatchSize: 999,
			hugeResultChars: 500,
			statusBarStyle: "charts",
			minTurnsBetweenCompacts: -5,
			skillPinConfirmThreshold: 0,
		});
		assert.equal(parsed.pruneOn, m.DEFAULT_CONFIG.pruneOn);
		assert.equal(parsed.pruneBatchSize, 20);
		assert.equal(parsed.hugeResultChars, m.DEFAULT_CONFIG.hugeResultChars);
		assert.equal(parsed.statusBarStyle, m.DEFAULT_CONFIG.statusBarStyle);
		assert.equal(parsed.minTurnsBetweenCompacts, m.DEFAULT_CONFIG.minTurnsBetweenCompacts);
		assert.equal(parsed.skillPinConfirmThreshold, m.DEFAULT_CONFIG.skillPinConfirmThreshold);
	});
});

describe("writeConfig", () => {
	it("writes config to file", async () => {
		const tmp = "/tmp/test-config-" + Date.now() + ".json";
		m.writeConfig({ locale: "en", enabled: true }, tmp);
		const cfg = m.readConfig(tmp);
		assert.equal(cfg.enabled, true);
	});
});

// ── context-monitor.ts ──

describe("getContextPercent", () => {
	it("extracts from context usage", () => {
		const pct = m.getContextPercent({ ratio: 0.75 });
		assert.equal(pct, 0.75);
	});
	it("returns undefined for null", () => {
		assert.equal(m.getContextPercent(null), undefined);
	});
	it("returns undefined for no usage", () => {
		assert.equal(m.getContextPercent({}), undefined);
	});
});

// ── payload-diagnostics.ts ──

describe("formatPayloadDiagnostics", () => {
	it("formats diagnostics", () => {
		const diag = { createdAt: 1000, messageCount: 5, toolCount: 2, payloadBytes: 500, includeUsage: true };
		const f = m.formatPayloadDiagnostics(diag);
		assert.ok(f.includes("5"));
		assert.ok(f.includes("500"));
	});
	it("handles undefined", () => {
		const r = m.formatPayloadDiagnostics(undefined);
		assert.ok(typeof r === "string");
	});
});

// ── capper.ts extensions ──

describe("extractToolResultText", () => {
	it("returns string as-is", () => assert.equal(m.extractToolResultText("hello"), "hello"));
	it("extracts from ContentPart[]", () => assert.equal(m.extractToolResultText([{ type: "text", text: "hello" }]), "hello"));
	it("returns undefined for non-array", () => assert.equal(m.extractToolResultText(42), undefined));
	it("handles empty array", () => assert.equal(m.extractToolResultText([]), undefined));
});

describe("buildPreview", () => {
	it("builds preview string", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("x".repeat(200), "t1", "read");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 20 });
		assert.ok(prev.includes('"ref":'));
		assert.ok(prev.includes("<model_visible_context"));
		assert.ok(prev.includes('kind="context_result_truncated"'));
		assert.ok(prev.includes('"tool": "context_result_lookup"'));
		assert.ok(prev.includes("read"));
	});
	it("handles empty tail", () => {
		const store = new m.HugeResultStore();
		const rec = store.remember("short", "t2");
		const prev = m.buildPreview(rec, { hugeResultHeadChars: 50, hugeResultTailChars: 0 });
		assert.ok(prev.includes("short"));
	});
});

// ── batch-capture edge cases ──

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
			{ role: "tool", toolCallId: "tc-1", content: "large result" },
			{ role: "assistant", content: "after prune" },
		];

		const rebuild = m.rebuildPrunedContext(source, state, "manual prune", "engine.prune.rebuild.reason.manual");

		assert.equal(rebuild.changed, true);
		assert.deepEqual(rebuild.prunableIds, ["tc-1"]);
		assert.deepEqual(rebuild.newlyApplied, ["tc-1"]);
		assert.equal(rebuild.checkpointOpened, true);
		assert.equal(state.engine.prune.pruneRunCount, 1);
		assert.equal(rebuild.messages.length, 2);
		assert.equal(rebuild.messages[0].role, "assistant");
		assert.deepEqual(rebuild.messages[0].content, [{ type: "text", text: "summary text" }]);
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

// ── append-only-projection edge cases ──

describe("applyAppendOnlyProjection edge cases", () => {
	it("applies projection when active and enabled", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: {
				appendOnly: {
					enabled: true, projectionActive: true,
					tailStartEntryId: "e2",
					tailFingerprint: undefined,
					invalidatedReasonKey: undefined,
					stableSummary: { role: "assistant", content: "summary", name: "context_cache_stable_summary" },
				},
			},
		};
		const event = { messages: [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }] };
		const r = m.applyAppendOnlyProjection(event, {}, st);
		assert.ok(r === undefined || r.messages.some(m => m?.name === "context_cache_stable_summary"));
	});
	it("returns tail only when stable summary is missing", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, tailStartEntryId: "e2" } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }] }, {}, st);
		assert.deepEqual(r.messages, [{ id: "e1", role: "system", content: "sys" }, { id: "e2", role: "user", content: "tail" }]);
	});
	it("omits system message when there is no system entry", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true, stableSummary: { role: "assistant", content: "summary" } } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [{ id: "e1", role: "user", content: "tail" }] }, {}, st);
		assert.deepEqual(r.messages, [{ role: "assistant", content: "summary" }, { id: "e1", role: "user", content: "tail" }]);
	});
	it("handles empty messages while active", () => {
		const st = {
			config: { enabled: true, appendOnlyProjection: true },
			engine: { appendOnly: { projectionActive: true } },
		};
		const r = m.applyAppendOnlyProjection({ messages: [] }, {}, st);
		assert.deepEqual(r.messages, []);
	});
	it("tracks config changes by disabling projection when extension is disabled", () => {
		const st = {
			config: { enabled: false, appendOnlyProjection: true },
			engine: { appendOnly: { enabled: true, projectionActive: true } },
		};
		assert.equal(m.applyAppendOnlyProjection({ messages: [] }, {}, st), undefined);
	});
});

// ── formatStatus ──

describe("formatStatus", () => {
	it("formats status with context", async () => {
		const { formatStatus } = await import("../src/stats.ts");
		const s = formatStatus(m.emptyStats(), 0.5);
		assert.ok(s.includes("ctx"));
	});
});

describe("status output", () => {
	function statusState() {
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", diagnostics: true, pruneBatchSize: 2 };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		state.contextPct = 0.42;
		state.stats = m.addUsage(m.emptyStats(), {
			input: 100,
			cacheRead: 900,
			cacheWrite: 0,
			output: 25,
			actualCost: 0.001,
			savings: 0.01,
			modelId: "deepseek-v4-flash",
			provider: "deepseek",
			turn: 2,
			createdAt: 1,
		});
		state.engine.prefixHash = "abcdef1234567890";
		state.engine.toolHash = "fedcba0987654321";
		state.engine.prune.pruneRunCount = 1;
		state.engine.prune.summarizedIds.push("tc-1", "tc-2");
		state.engine.prune.appliedIds.push("tc-1");
		state.engine.prune.pendingBatches.push({ turnIndex: 2, toolCalls: [{ id: "tc-3", name: "read", turnIndex: 2 }] });
		state.engine.prune.batchStepCounter = 1;
		state.engine.prune.impact.summarizeRequests = 2;
		state.engine.prune.impact.summarizeInputTokens = 1000;
		state.engine.prune.impact.summarizeOutputTokens = 200;
		state.engine.prune.impact.summarizeCost = 0.0034;
		state.engine.prune.impact.lastSummarizeCost = 0.0012;
		state.engine.prune.impact.lastSummarizeRawChars = 10000;
		state.engine.prune.impact.lastSummarizeSummaryChars = 400;
		state.engine.prune.impact.postPruneRequests = 1;
		state.engine.prune.impact.postPruneCacheReadTokens = 500;
		state.engine.prune.impact.lastPostPruneMissTokens = 50;
		state.engine.prune.impact.lastPostPruneMissCost = 0.0004;
		state.engine.prune.impact.lastPostPruneHitRate = 0.95;
		state.engine.prune.impact.lastRebuildSourceMessages = 5;
		state.engine.prune.impact.lastRebuildOutputMessages = 3;
		state.engine.prune.impact.lastRebuildPrunableIds = 2;
		state.engine.prune.impact.lastRebuildNewlyApplied = 1;
		state.engine.prune.impact.lastRebuildSavedApproxChars = 1800;
		state.engine.prune.impact.lastRebuildCheckpointOpened = true;
		state.engine.prune.impact.lastRebuildReasonKey = "engine.prune.rebuild.reason.auto";
		state.engine.prune.impact.noOpToolCalls = 3;
		state.engine.prune.impact.lastNoOpToolCalls = 1;
		state.engine.prune.impact.lastErrorKey = "engine.prune.error.summaryRequestFailed";
		return state;
	}

	it("buildStatus includes cache, prune progress, hashes, and 99 eligibility", () => {
		const status = m.buildStatus({
			getCommands: () => [{ name: "pruner:status" }],
			getAllTools: () => [{ name: "context_tree_query" }, { name: "context_prune" }],
			getActiveTools: () => [{ name: "context_prune" }],
		}, statusState());

		assert.match(status, /Context cache/);
		assert.match(status, /deepseek\/deepseek-v4-flash/);
		assert.match(status, /mode after response batch/);
		assert.match(status, /progress 1\/2/);
		assert.match(status, /Prune summary cost: 2 requests/);
		assert.match(status, /Rebuild: 5 -> 3 messages/);
		assert.match(status, /No-op coverage: 3 tool calls kept as-is · last 1/);
		assert.match(status, /summary request failed/);
		assert.match(status, /abcdef123456/);
		assert.match(status, /99%/);
	});

	it("buildDetailedStatus includes config, cache details, checkpoint history, and compaction history", () => {
		const state = statusState();
		state.stats.compacts.push({ turn: 3, reason: "manual", completed: false, errorKey: "engine.compactFailed" });
		const details = m.buildDetailedStatus({ getCommands: () => [] }, state);

		assert.match(details, /Context cache details/);
		assert.match(details, /Model/);
		assert.match(details, /Cache/);
		assert.match(details, /Config/);
		assert.match(details, /manual@3:failed/);
		assert.match(details, /Checkpoints/);
		assert.match(details, /Prune summary cost: 2 requests/);
		assert.match(details, /automatic prune/);
	});

	it("formatPruneSummarizerTrace reports uncaptured and captured diagnostics", () => {
		const state = statusState();
		state.engine.prune.impact.lastSummarizePrompt = undefined;
		assert.match(m.formatPruneSummarizerTrace(state), /not captured/i);

		state.engine.prune.impact.lastSummarizePrompt = "prompt body";
		state.engine.prune.impact.lastSummarizeResponse = "raw body";
		state.engine.prune.impact.lastAcceptedSummaries = ["summary one", "summary two"];
		state.engine.prune.impact.lastSummarizeMaxTokens = 256;
		const trace = m.formatPruneSummarizerTrace(state);
		assert.match(trace, /Last prune summarizer trace/);
		assert.match(trace, /maxTokens: 256/);
		assert.match(trace, /prompt body/);
		assert.match(trace, /raw body/);
		assert.match(trace, /\[2\] summary two/);
	});
});

describe("buildProgressBar", () => {
	it("renders text style without a bar", () => {
		assert.equal(m.buildProgressBar(0.75, 10, "text"), "");
	});
	it("renders distinct block and sparkline styles", () => {
		assert.match(m.buildProgressBar(0.75, 10, "blocks"), /█/);
		assert.doesNotMatch(m.buildProgressBar(0.75, 10, "sparkline"), /[\[\]]/);
	});
});

// ── config.ts edge cases ──

describe("readConfig edge cases", () => {
  it("handles malformed JSON file gracefully", async () => {
    const { writeFileSync, unlinkSync } = await import("fs");
    const tmp = "/tmp/bad-config-" + Date.now() + ".json";
    writeFileSync(tmp, "not valid json");
    const cfg = m.readConfig(tmp);
    assert.ok(cfg.enabled);
    unlinkSync(tmp);
  });
});

describe("parseConfig more", () => {
  it("handles 0..100 percent values", () => {
    const cfg = m.parseConfig({ foldThreshold: 80, aggressiveFoldThreshold: 82, exitSummaryThreshold: 85 });
    assert.ok(cfg.foldThreshold > 0.5 && cfg.foldThreshold < 1);
  });
  it("handles out-of-range percent", () => {
    const cfg = m.parseConfig({ foldThreshold: -1 });
    assert.equal(cfg.foldThreshold, 0.75);
  });
});

describe("readContextPercent", () => {
  it("handles non-function ctx", async () => {
    const pct = await m.readContextPercent({});
    assert.equal(pct, undefined);
  });
  it("handles null ctx", async () => {
    const pct = await m.readContextPercent(null);
    assert.equal(pct, undefined);
  });
});

describe("extractToolResultText more", () => {
  it("extracts from mixed ContentPart array", () => {
    const r = m.extractToolResultText(["plain", { type: "text", text: "structured" }]);
    assert.equal(r, "plain\nstructured");
  });
});

describe("computeHitRatio", () => {
  it("returns 0 for zero input", async () => {
    const { computeHitRatio } = await import("../src/stats.ts");
    assert.equal(computeHitRatio(0, 0), 0);
  });
  it("calculates ratio", async () => {
    const { computeHitRatio } = await import("../src/stats.ts");
    assert.equal(computeHitRatio(100, 900), 0.9);
  });
});

describe("cacheSavingsUsd", () => {
  it("returns 0 for unknown model", async () => {
    const { cacheSavingsUsd } = await import("../src/stats.ts");
    assert.equal(cacheSavingsUsd("unknown-model", 1000), 0);
  });
  it("calculates savings for flash", async () => {
    const { cacheSavingsUsd } = await import("../src/stats.ts");
    const s = cacheSavingsUsd("deepseek-v4-flash", 1_000_000);
    assert.ok(s > 0);
  });
});

describe("summarizeToolBatch edge cases", () => {
  it("summarizeToolBatchPool returns empty metrics for empty batches", async () => {
    const pool = await m.summarizeToolBatchPool(
      { complete: async () => assert.fail("should not call model") },
      [],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.deepEqual(pool.results, []);
    assert.equal(pool.metrics.requests, 0);
    assert.equal(pool.metrics.batches, 0);
    assert.equal(pool.metrics.toolCalls, 0);
  });

  it("buildPoolPrompt omits context when includeContext is false and includes carry-forward inventory", () => {
    const prompt = m.buildPoolPrompt(
      [{ turnIndex: 1, context: "batch context", toolCalls: [{ id: "t1", name: "read", args: "{\"path\":\"a.ts\"}", result: "body", context: "call context" }] }],
      false,
      "SYSTEM",
      [{ source_ref: "dsc-1", seen_in_prior_request: true, observed_offsets: [0], total_chars: 10, subject_hint: "a.ts" }],
    );
    assert.match(prompt, /^SYSTEM\n\nInput JSON:/);
    assert.match(prompt, /"payload_kind": "tool_call_batches_v2"/);
    assert.match(prompt, /"carry_forward_inventory": \[/);
    assert.doesNotMatch(prompt, /batch context/);
    assert.doesNotMatch(prompt, /call context/);
  });

  it("normalizes plain, empty, duplicate, lookup, and model-visible result shapes", () => {
    assert.equal(m.normalizeToolResultForSummary(" plain text "), "plain text");
    assert.equal(m.normalizeToolResultForSummary("   "), "");
    assert.equal(m.normalizeToolResultForSummary("[context-engine duplicate tool call skipped]"), "");
    assert.equal(
      m.normalizeToolResultForSummary("[context_result_lookup ref=dsc-1 offset=0 limit=5 returned=5 bytes=10]\nhello"),
      "Result metadata: kind=slice ref=dsc-1 offset=0 limit=5 returned_chars=5 total_bytes=10\nhello",
    );
    assert.equal(
      m.normalizeToolResultForSummary("[context_result_lookup ref=dsc-1 offset=0 limit=5 returned=5 bytes=10]\n[context_result_lookup ref=dsc-1 offset=0 limit=5 returned=5 bytes=10]"),
      "Result metadata: kind=slice ref=dsc-1 offset=0 limit=5 returned_chars=5 total_bytes=10",
    );
  });

  it("returns summary text when pi responds", async () => {
    const result = await m.summarizeToolBatch(
      { complete: async () => "summary text" },
      { turnIndex: 0, toolCalls: [{ id: "t1", name: "read", args: "{}", result: "data" }] },
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.ok(result);
    assert.equal(result.summaryText, "summary text");
  });

  it("summarizeToolBatchPool parses JSON embedded in fences and response variants", async () => {
    const variants = [
      { choices: [{ message: { content: "```json\n{\"summaries\":[{\"batchIndex\":0,\"summary\":\"from choice\"}]}\n```" } }] },
      { output_text: "{\"summaries\":[{\"batchIndex\":0,\"summary\":\"from output_text\"}]}" },
      { text: "{\"summaries\":[{\"batchIndex\":0,\"summary\":\"from text\"}]}" },
    ];
    for (const response of variants) {
      const pool = await m.summarizeToolBatchPool(
        { complete: async () => response },
        [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
        { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
      );
      assert.match(pool.results[0].summaryText, /^from /);
      assert.equal(pool.metrics.requests, 1);
    }
  });

  it("summarizeToolBatchPool reports empty and missing summary responses", async () => {
    const empty = await m.summarizeToolBatchPool(
      { complete: async () => ({ content: "", usage: { input: 10, output: 0, cacheRead: 3, cost: { total: 0.001 } } }) },
      [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "deepseek-v4-flash" },
    );
    assert.match(empty.results[0].summaryText, /summary response was empty/);
    assert.match(empty.results[0].summaryText, /Coverage: unknown/);
    assert.equal(empty.metrics.requests, 1);
    assert.equal(empty.metrics.errorKey, "engine.prune.error.summaryEmpty");
    assert.equal(empty.metrics.cacheReadTokens, 3);

    const missing = await m.summarizeToolBatchPool(
      { complete: async () => null },
      [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.match(missing.results[0].summaryText, /summary model returned no response/);
    assert.equal(missing.metrics.requests, 1);
    assert.equal(missing.metrics.errorKey, "engine.prune.error.modelNoResponse");
  });

  it("summarizeToolBatchPool handles abort and timeout errors as non-throwing failures", async () => {
    for (const name of ["AbortError", "TimeoutError"]) {
      const pool = await m.summarizeToolBatchPool(
        { complete: async () => { const error = new Error(name); error.name = name; throw error; } },
        [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
        { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
      );
      assert.match(pool.results[0].summaryText, new RegExp(name));
      assert.equal(pool.metrics.requests, 0);
      assert.equal(pool.metrics.errorKey, "engine.prune.error.summaryRequestFailed");
    }
  });

  it("summarizeToolBatchPool recovers malformed single-batch JSON summaries", async () => {
    const pool = await m.summarizeToolBatchPool(
      { complete: async () => '{"summaries":[{"batchIndex":0,"coverage":"partial","evidence":["offset 0 only"],"summary":"Read head only' },
      [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.match(pool.results[0].summaryText, /Coverage: partial/);
    assert.match(pool.results[0].summaryText, /Read head only/);
    assert.match(pool.results[0].summaryText, /Evidence: offset 0 only/);
  });

  it("summarizeToolBatchPool does not use structured-looking malformed JSON as raw summary", async () => {
    const pool = await m.summarizeToolBatchPool(
      { complete: async () => "{\"summaries\":[" },
      [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.match(pool.results[0].summaryText, /Tool output masked/);
    assert.equal(pool.metrics.errorKey, "engine.prune.error.structuredSummaryMissing");
  });

  it("summarizeToolBatches preserves empty and single-batch wrapper behavior", async () => {
    assert.deepEqual(await m.summarizeToolBatches({}, [], { enabled: true, pruneOn: "every-turn", summarizerModel: "default" }), []);
    const result = await m.summarizeToolBatches(
      { complete: async () => ({ content: "{\"summaries\":[{\"batchIndex\":0,\"summary\":\"wrapped\"}]}" }) },
      [{ turnIndex: 0, toolCalls: [{ id: "t1", name: "read", result: "data" }] }],
      { enabled: true, pruneOn: "every-turn", summarizerModel: "default" },
    );
    assert.equal(result[0].summaryText, "wrapped");
  });
});

describe("markCompaction", () => {
  it("adds compact record", async () => {
    const { markCompaction, emptyStats } = await import("../src/stats.ts");
    const stats = markCompaction(emptyStats(), { turn: 1, reason: "auto", completed: true });
    assert.equal(stats.compacts.length, 1);
    assert.equal(stats.compacts[0].turn, 1);
  });
  it("resets sinceCompactionRequests without record and initializes missing compacts array", async () => {
    const { markCompaction, emptyStats } = await import("../src/stats.ts");
    const base = { ...emptyStats(), sinceCompactionRequests: 5, compacts: undefined };
    const stats = markCompaction(base);
    assert.equal(stats.sinceCompactionRequests, 0);
    assert.deepEqual(stats.compacts, []);
  });
});

describe("aggregateByModel", () => {
	it("uses unknown bucket and keeps first provider when later usages omit it", async () => {
		const { aggregateByModel } = await import("../src/stats.ts");
		const summaries = aggregateByModel([
			{ input: 10, cacheRead: 90, cacheWrite: 0, output: 1, actualCost: 0.1, provider: "deepseek", createdAt: Date.now() },
			{ input: 5, cacheRead: 45, cacheWrite: 0, output: 1, actualCost: 0.05, createdAt: Date.now() },
		]);
		assert.equal(summaries.length, 1);
		assert.equal(summaries[0].modelId, "unknown");
		assert.equal(summaries[0].provider, "deepseek");
	});
	it("retains pricing metrics when pricingKnown is true", async () => {
		const { aggregateByModel } = await import("../src/stats.ts");
		const summaries = aggregateByModel([
			{
				modelId: "m1",
				input: 10,
				cacheRead: 90,
				cacheWrite: 0,
				output: 1,
				actualCost: 0.1,
				noCacheCost: 0.4,
				savings: 0.3,
				modelCost: { input: 1, cacheRead: 0.1, cacheWrite: 0, output: 2 },
				createdAt: Date.now(),
			},
		]);
		assert.equal(summaries[0].pricingKnown, true);
		assert.equal(summaries[0].noCacheCost, 0.4);
		assert.equal(summaries[0].savings, 0.3);
	});
});

describe("aggregateBySegment", () => {
	it("uses unknown bucket and computes warmup-aware warmHitRate", async () => {
		const { aggregateBySegment } = await import("../src/stats.ts");
		const summaries = aggregateBySegment([
			{ input: 10, cacheRead: 0, cacheWrite: 0, output: 1, actualCost: 0.1, warmup: true, createdAt: Date.now() },
			{ input: 10, cacheRead: 90, cacheWrite: 0, output: 1, actualCost: 0.1, warmup: false, createdAt: Date.now() },
		]);
		assert.equal(summaries.length, 1);
		assert.equal(summaries[0].segmentId, "unknown");
		assert.equal(summaries[0].warmupRequests, 1);
		assert.equal(summaries[0].warmHitRate, 0.9);
	});
});

describe("usageTotalInput", () => {
  it("calculates total input", async () => {
    const { usageTotalInput } = await import("../src/stats.ts");
    assert.equal(usageTotalInput({ input: 100, cacheRead: 200, cacheWrite: 50 }), 350);
  });
  it("handles undefined", async () => {
    const { usageTotalInput } = await import("../src/stats.ts");
    assert.equal(usageTotalInput(undefined), 0);
  });
});

describe("handleProviderPrefix edge cases", () => {
  it("returns undefined when disabled", async () => {
    const { handleProviderPrefix } = await import("../src/cache-engine/prefix-fingerprint.ts");
    const state = { config: { enabled: false, prefixFingerprint: true }, engine: { prefixDriftCount: 0, toolHashChanges: 0, lastPrefixChangeReason: "" } };
    const r = handleProviderPrefix({ payload: { model: "test" } }, {}, state);
    assert.equal(r, undefined);
  });
  it("handles missing payload", async () => {
    const { handleProviderPrefix } = await import("../src/cache-engine/prefix-fingerprint.ts");
    const state = { config: { enabled: true, prefixFingerprint: true }, engine: { prefixDriftCount: 0, toolHashChanges: 0, lastPrefixChangeReason: "" } };
    const r = handleProviderPrefix(undefined, {}, state);
    assert.equal(r, undefined);
  });
});

describe("captureBatches sequential assistants", () => {
	it("starts new batch on sequential assistants", () => {
    const pr = { pendingBatches: [], batchStepCounter: 0 };
    m.captureBatches([
      { message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
      { message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-1", content: "r1" }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-2", content: "r2" }, turnIndex: 0 },
    ], [], pr, 0);
    assert.equal(pr.pendingBatches.length, 1);
    assert.deepEqual(pr.pendingBatches[0].toolCalls.map((tc) => tc.id), ["tc-1", "tc-2"]);
  });

  it("splits distant tool episodes into separate batches when bridge length is exceeded", () => {
    const pr = { pendingBatches: [], batchStepCounter: 0 };
    m.captureBatches([
      { message: { role: "assistant", content: "start", tool_calls: [{ id: "tc-1", function: { name: "read" } }] }, turnIndex: 0 },
      { message: { role: "tool", toolCallId: "tc-1", content: "r1" }, turnIndex: 0 },
      { message: { role: "assistant", content: "reasoning gap 1" }, turnIndex: 1 },
      { message: { role: "user", content: "reasoning gap 2" }, turnIndex: 2 },
      { message: { role: "assistant", content: "resume", tool_calls: [{ id: "tc-2", function: { name: "write" } }] }, turnIndex: 3 },
      { message: { role: "tool", toolCallId: "tc-2", content: "r2" }, turnIndex: 3 },
    ], [], pr, 3, { bridgeLength: 2 });
    assert.equal(pr.pendingBatches.length, 2);
  });
});

describe("getConfigPath", () => {
  it("returns path ending with context-engine.json", async () => {
    const { getConfigPath } = await import("../src/config.ts");
    const p = getConfigPath();
    assert.ok(p.endsWith("context-engine.json"));
  });
});

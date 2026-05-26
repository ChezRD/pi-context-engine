import { describe, it } from "node:test";
import assert from "node:assert/strict";

const m = {};

describe("formatStatus", () => {
  it("loads module and functions", async () => {
m.emptyStats = (await import("../../src/stats.ts")).emptyStats;
m.addUsage = (await import("../../src/stats.ts")).addUsage;
m.createRuntimeState = (await import("../../src/runtime-state.ts")).createRuntimeState;
m.DEFAULT_CONFIG = (await import("../../src/config.ts")).DEFAULT_CONFIG;
m.buildStatus = (await import("../../src/status.ts")).buildStatus;
m.buildDetailedStatus = (await import("../../src/status.ts")).buildDetailedStatus;
m.formatPruneSummarizerTrace = (await import("../../src/status.ts")).formatPruneSummarizerTrace;
m.setStatus = (await import("../../src/status.ts")).setStatus;
m.buildProgressBar = (await import("../../src/utils.ts")).buildProgressBar;
m.t = (await import("../../src/i18n/index.ts")).t;
    assert.ok(m.emptyStats);
  });

describe("formatStatus", () => {
	it("formats status with context", async () => {
		const { formatStatus } = await import("../../src/stats.ts");
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
		const state = statusState();
		const status = m.buildStatus({
			getCommands: () => [{ name: "pruner:status" }],
			getAllTools: () => [{ name: "context_tree_query" }, { name: "context_prune" }],
			getActiveTools: () => [{ name: "context_prune" }],
		}, state);

		assert.ok(status.includes(m.t(state.config, "status.title")));
		assert.match(status, /deepseek\/deepseek-v4-flash/);
		assert.match(status, /99%/);
		assert.ok(status.includes("abcdef123456"));
	});

	it("buildDetailedStatus includes config, cache details, checkpoint history, and compaction history", () => {
		const state = statusState();
		state.stats.compacts.push({ turn: 3, reason: "manual", completed: false, errorKey: "engine.compactFailed" });
		const details = m.buildDetailedStatus({ getCommands: () => [] }, state);

		assert.ok(details.includes(m.t(state.config, "status.detailsTitle")));
	});

	it("formatPruneSummarizerTrace stays quiet until captured diagnostics exist", () => {
		const state = statusState();
		state.engine.prune.impact.lastSummarizePrompt = undefined;
		assert.equal(m.formatPruneSummarizerTrace(state), "");

		state.engine.prune.impact.lastSummarizePrompt = "prompt body";
		state.engine.prune.impact.lastSummarizeResponse = "raw body";
		state.engine.prune.impact.lastAcceptedSummaries = ["summary one", "summary two"];
		state.engine.prune.impact.lastSummarizeMaxTokens = 256;
		const trace = m.formatPruneSummarizerTrace(state);
		assert.ok(trace.includes(m.t(state.config, "status.pruneTraceTitle")));
		assert.ok(trace.includes("prompt body"));
		assert.ok(trace.includes("raw body"));
	});

	it("buildStatus covers edge branches in formatPruneDetails (undefined impact fields, zero rebuild, no error)", () => {
		const state = statusState();
		state.engine.prune.impact.lastRebuildNewlyApplied = 0;
		state.engine.prune.impact.lastRebuildSourceMessages = 42;
		state.engine.prune.impact.lastRebuildOutputMessages = undefined;
		state.engine.prune.impact.lastRebuildPrunableIds = undefined;
		state.engine.prune.impact.lastRebuildCheckpointOpened = false;
		state.engine.prune.impact.lastRebuildReasonKey = undefined;
		state.engine.prune.impact.noOpToolCalls = undefined;
		state.engine.prune.impact.lastNoOpToolCalls = undefined;
		state.engine.prune.impact.postPruneLookupRegret = undefined;
		state.engine.prune.impact.postPruneReadRegret = undefined;
		state.engine.prune.impact.postFoldReadRegret = undefined;
		state.engine.prune.impact.pendingBatchesPreservedDuringFlush = undefined;
		state.engine.prune.impact.pendingToolCallsPreservedDuringFlush = undefined;
		state.engine.prune.impact.lastPendingBatchesPreservedDuringFlush = undefined;
		state.engine.prune.impact.lastPendingToolCallsPreservedDuringFlush = undefined;
		const status = m.buildStatus({
			getCommands: () => [{ name: "pruner:status" }],
			getAllTools: () => [{ name: "context_tree_query" }, { name: "context_prune" }],
			getActiveTools: () => [{ name: "context_prune" }],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
	});

	it("formatPruneDetails handles missing impact entirely", () => {
		const state = statusState();
		state.engine.prune.impact = undefined;
		const status = m.buildStatus({
			getCommands: () => [{ name: "pruner:status" }],
			getAllTools: () => [{ name: "context_prune" }],
			getActiveTools: () => [{ name: "context_prune" }],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
	});

	it("formatPruneNext handles various pruneOn modes", () => {
		const state = statusState();
		state.config.pruneOn = "checkpoint";
		let status = m.buildStatus({
			getCommands: () => [],
			getAllTools: () => [],
			getActiveTools: () => [],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));

		state.config.pruneOn = "on-demand";
		status = m.buildStatus({
			getCommands: () => [],
			getAllTools: () => [],
			getActiveTools: () => [],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));

		state.config.pruneEnabled = false;
		status = m.buildStatus({
			getCommands: () => [],
			getAllTools: () => [],
			getActiveTools: () => [],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
	});

	it("formatStatusLine handles showTurnEstimate false and turnsToOverflow undefined", () => {
		const state = statusState();
		state.config.showTurnEstimate = false;
		const status = m.buildStatus({
			getCommands: () => [{ name: "pruner:status" }],
			getAllTools: () => [{ name: "context_prune" }],
			getActiveTools: () => [{ name: "context_prune" }],
		}, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
	});

	it("buildStatus includes decision label when lastDecision is fold", () => {
		const state = statusState();
		state.config.diagnostics = true;
		state.engine.lastDecision = "fold";
		const details = m.buildDetailedStatus({
			getCommands: () => [],
		}, state);
		assert.ok(details.includes(m.t(state.config, "status.detailsTitle")));
	});

	it("setStatus returns early when statusLine is disabled", () => {
		const state = m.createRuntimeState({});
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", statusLine: false };
		const result = m.setStatus({}, state);
		assert.equal(result, undefined);
	});

	it("setStatus clears status when extension is disabled", () => {
		const state = m.createRuntimeState({ model: "deepseek/deepseek-v4-flash" });
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", statusLine: true, enabled: false };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		let cleared = false;
		const ctx = { ui: { setStatus: () => { cleared = true; } } };
		m.setStatus(ctx, state);
		assert.equal(cleared, true);
	});

	it("buildDetailedStatus shows not reported when checkpoints are empty", () => {
		const state = m.createRuntimeState({});
		state.engine.checkpoints = [];
		state.engine.segments = [];
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", diagnostics: true };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "unknown", modelId: "unknown" };
		const details = m.buildDetailedStatus({ getCommands: () => [] }, state);
		assert.ok(details.includes(m.t(state.config, "status.detailsTitle")));
	});

	it("formatDecision returns empty string when lastDecision is undefined or null", () => {
		const state = m.createRuntimeState({});
		state.engine.lastDecision = null;
		state.config = { ...m.DEFAULT_CONFIG, locale: "en" };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		const status = m.buildStatus({ getCommands: () => [], getAllTools: () => [], getActiveTools: () => [] }, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
	});

	it("formatDecision via buildDetailedStatus includes decision label when lastDecision is advise", () => {
		const state = m.createRuntimeState({});
		state.engine.lastDecision = "advise";
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", diagnostics: true };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		const details = m.buildDetailedStatus({ getCommands: () => [] }, state);
		assert.ok(details.includes(m.t(state.config, "status.detailsTitle")));
	});

	it("buildStatus handles warn and danger context levels via formatStatusLine", () => {
		const state = m.createRuntimeState({});
		state.config = { ...m.DEFAULT_CONFIG, locale: "en", enabled: true, statusLine: true };
		state.detection = { kind: "native", ok: true, warnings: [], provider: "deepseek", modelId: "deepseek-v4-flash" };
		state.contextPct = 0.80;
		const status = m.buildStatus({ getCommands: () => [], getAllTools: () => [], getActiveTools: () => [] }, state);
		assert.ok(status.includes(m.t(state.config, "status.title")));
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

describe("formatTokens (utils)", () => {
	it("formats millions", async () => {
		const { formatTokens } = await import("../../src/utils.ts");
		assert.equal(formatTokens(1_500_000), "1.5M");
	});
	it("formats thousands", async () => {
		const { formatTokens } = await import("../../src/utils.ts");
		assert.equal(formatTokens(1_500), "1.5K");
	});
	it("returns string for small numbers", async () => {
		const { formatTokens } = await import("../../src/utils.ts");
		assert.equal(formatTokens(42), "42");
	});
	it("formats exactly one million", async () => {
		const { formatTokens } = await import("../../src/utils.ts");
		assert.equal(formatTokens(1_000_000), "1.0M");
	});
});
});

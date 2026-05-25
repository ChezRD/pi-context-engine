import test from "node:test";
import assert from "node:assert/strict";

import { detectDeepSeekModel } from "../src/model.ts";
import { emptyStats, addUsage, cacheSavingsUsd, computeHitRatio, costToCompact, deepSeekOfficialCost, extractUsageSnapshot, formatRatio, formatTokenCount, hitRatio, savingsFromRealCost, aggregateByModel, aggregateBySegment, currentSegmentStats, warmHitRate, markCompaction } from "../src/stats.ts";
import { inspectProviderPayload } from "../src/payload-diagnostics.ts";
import { parseConfig, DEFAULT_CONFIG } from "../src/config.ts";
import { createRuntimeState } from "../src/runtime-state.ts";
import { syncModelSelection } from "../src/index.ts";
import { applyLocale, t } from "../src/i18n/index.ts";
import { classifyPruner, detectPruner } from "../src/pruner-advisor.ts";
import { getContextPercent, recommendContextAction } from "../src/context-monitor.ts";
import { CUSTOM_TYPE_HUGE_RESULT, HugeResultStore, buildPreview, maybeCapToolResult, persistHugeResult, registerLookupTool, renderStoredHugeResult, restoreHugeResultsFromSession } from "../src/capper.ts";
import { MODEL_VISIBLE_CONTEXT_MARKER, MODEL_VISIBLE_CONTEXT_SCHEMA } from "../src/model-visible.ts";
import { estimateTokens, maybeAdjustCutForCache, simpleHash } from "../src/cache-engine/custom-compaction.ts";
import { openCacheCheckpoint, currentCacheSegment, annotateUsageForCurrentSegment } from "../src/cache-engine/cache-checkpoints.ts";
import { canCompactNow, decideCompaction, detectTextualToolCall, diffPrefix, extractCachePrefix, handleContext, handleMessageEnd, handleProviderPrefix, handleSessionBeforeCompact, handleToolCall, handleTurnEnd, normalizeTools, registerParallelReadTool, shouldNotifyPrefixDrift, stableHash } from "../src/cache-engine/index.ts";
import { decideAfterUsage, estimateTurnStart, readContextUsage, zoneForRatio } from "../src/cache-engine/decision-engine.ts";
import { CUSTOM_TYPE_PRUNE_DEBUG, CUSTOM_TYPE_TELEMETRY, restoreTelemetryFromSession } from "../src/telemetry-persistence.ts";
import { pruneMessages } from "../src/projection/pruner.ts";
import { rebuildPrunedContextFromSession } from "../src/projection/rebuild.ts";
import { executePrune, registerPruneTool, syncPruneToolActivation } from "../src/projection/prune-tool.ts";
import { captureTurnEndBatch } from "../src/projection/batch-capture.ts";

test("detects built-in DeepSeek model as native", () => {
  const result = detectDeepSeekModel({
    provider: "deepseek",
    id: "deepseek-v4-flash",
    reasoning: true,
    compat: { thinkingFormat: "deepseek", requiresReasoningContentOnAssistantMessages: true },
    thinkingLevelMap: { high: "high", xhigh: "max" },
  });
  assert.equal(result.kind, "native");
  assert.equal(result.ok, true);
});

test("warns for DeepSeek-looking model without compat", () => {
  const result = detectDeepSeekModel({ provider: "custom", id: "deepseek-v4-flash", reasoning: true });
  assert.equal(result.kind, "misconfigured");
  assert.equal(result.ok, false);
  assert.match(result.warnings.join("\n"), /thinkingFormat/);
});

test("computes cache stats from Pi usage", () => {
  const snap = extractUsageSnapshot({ usage: { input: 10, cacheRead: 90, cacheWrite: 0, output: 5, cost: 0.001 } });
  const stats = addUsage(emptyStats(), snap);
  assert.equal(stats.requests, 1);
  assert.equal(stats.input, 10);
  assert.equal(stats.cacheRead, 90);
  assert.equal(hitRatio(stats.input, stats.cacheRead), 0.9);
});

test("usage snapshot extraction handles sparse, invalid, and nested shapes", () => {
  const cacheOnly = extractUsageSnapshot({ id: "req-1", usage: { cacheRead: 42, cost: { total: 0.01 } } });
  assert.equal(cacheOnly.cacheRead, 42);
  assert.equal(cacheOnly.hitRate, 1);
  assert.equal(cacheOnly.cost, 0.01);
  assert.equal(cacheOnly.requestId, "req-1");

  assert.equal(extractUsageSnapshot({ usage: { input: -1, output: 0 } }), undefined);
  assert.equal(extractUsageSnapshot({ usage: [] }), undefined);
  assert.equal(extractUsageSnapshot({ usage: null }), undefined);

  const preferred = extractUsageSnapshot({ usage: { input: 5 }, message: { usage: { input: 99 } } });
  assert.equal(preferred.input, 5);
});

test("no-cache savings display is UX-only and non-negative", () => {
  const usage = { input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, cost: 1 };
  assert.equal(savingsFromRealCost(usage, { input: 0.14, output: 0.28, cacheRead: 0.0028 }), 0);
  const snap = extractUsageSnapshot({ usage });
  const stats = addUsage(emptyStats(), snap, "deepseek/deepseek-v4-flash", { input: 0.14, output: 0.28, cacheRead: 0.0028 });
  assert.equal(stats.savings, 0);
  assert.equal(stats.last.savings, 0);
  assert.equal(snap.cost, 1);
  assert.equal(usage.cost, 1);
});

test("stats helpers cover pricing, ratios, formatting, grouping, compaction, and compact cost edge cases", () => {
  assert.deepEqual(deepSeekOfficialCost("deepseek-reasoner"), deepSeekOfficialCost("deepseek-v4-flash"));
  assert.deepEqual(deepSeekOfficialCost("deepseek-chat"), deepSeekOfficialCost("deepseek-v4-flash"));
  assert.deepEqual(deepSeekOfficialCost("DeepSeek-V4-Flash"), deepSeekOfficialCost("deepseek-v4-flash"));
  assert.equal(deepSeekOfficialCost(null), undefined);
  assert.equal(deepSeekOfficialCost("mixtral-8x7b"), undefined);

  assert.equal(hitRatio(100, 0), 0);
  assert.equal(hitRatio(0, 2, 0), 1);
  assert.equal(computeHitRatio(0, 0, 0), 0);
  assert.equal(formatRatio(undefined), "n/a");
  assert.equal(formatRatio(0), "0.0%");
  assert.equal(formatRatio(0.756), "75.6%");
  assert.equal(formatTokenCount(500), "500");
  assert.equal(formatTokenCount(1500), "1.5k");
  assert.equal(formatTokenCount(1500000), "1.5M");
  assert.equal(formatTokenCount(0), "0");

  const modelSummaries = aggregateByModel([
    { input: 10, cacheRead: 10, cacheWrite: 0, output: 1, actualCost: 1, noCacheCost: 2, savings: 1, modelCost: { input: 1, output: 1 }, provider: "deepseek" },
    { input: 10, cacheRead: 0, cacheWrite: 0, output: 1, actualCost: 1, noCacheCost: 2, savings: 1 },
    { input: 0, cacheRead: 5, cacheWrite: 0, output: 1, actualCost: 1, modelId: "m2", provider: "fallback" },
  ]);
  const unknown = modelSummaries.find((summary) => summary.modelId === "unknown");
  assert.equal(unknown.provider, "deepseek");
  assert.equal(unknown.pricingKnown, true);
  assert.equal(unknown.noCacheCost, 4);
  assert.equal(unknown.savings, 2);
  assert.equal(modelSummaries.find((summary) => summary.modelId === "m2").pricingKnown, false);

  const segmentSummaries = aggregateBySegment([
    { input: 10, cacheRead: 0, cacheWrite: 0, output: 1, actualCost: 1, segmentId: "s1", warmup: true },
    { input: 0, cacheRead: 10, cacheWrite: 0, output: 1, actualCost: 1, segmentId: "s1", warmup: false },
    { input: 5, cacheRead: 5, cacheWrite: 0, output: 1, actualCost: 1 },
  ]);
  const s1 = segmentSummaries.find((summary) => summary.segmentId === "s1");
  assert.equal(s1.warmupRequests, 1);
  assert.equal(s1.warmHitRate, 1);
  assert.equal(segmentSummaries.find((summary) => summary.segmentId === "unknown").requests, 1);

  assert.deepEqual(markCompaction({ ...emptyStats(), compacts: undefined }).compacts, []);
  assert.equal(markCompaction(emptyStats()).sinceCompactionRequests, 0);

  const pricing = { input: 1, cacheRead: 0.1, cacheWrite: 0, output: 2 };
  assert.equal(costToCompact(undefined, pricing), 0);
  assert.equal(costToCompact({ input: 100, cacheRead: 0, cacheWrite: 0 }, undefined), 0);
  assert.equal(costToCompact({ input: 100, cacheRead: 100, cacheWrite: 0 }, pricing), 0.00009);
});

test("addUsage handles missing snapshots, explicit costs, and missing compacts", () => {
  const base = { ...emptyStats(), compacts: undefined };
  assert.equal(addUsage(base, undefined), base);

  const withModelCost = addUsage(base, { input: 1000, cacheRead: 0, cacheWrite: 0, output: 0, modelCost: { input: 1, cacheRead: 0.1, cacheWrite: 0, output: 2 }, createdAt: 1 });
  assert.equal(withModelCost.requests, 1);
  assert.equal(withModelCost.cost, 0.001);
  assert.deepEqual(withModelCost.compacts, []);

  const withProviderCost = addUsage(emptyStats(), { input: 1000, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0.123, createdAt: 1 }, "custom-model", { input: 1, output: 2 });
  assert.equal(withProviderCost.cost, 0.123);
  assert.equal(withProviderCost.last.actualCost, 0.123);
});

test("inspects DeepSeek provider payload", () => {
  const diag = inspectProviderPayload({
    messages: [{ role: "assistant", content: "x" }, { role: "assistant", content: "y", reasoning_content: "" }],
    tools: [{ type: "function" }],
    thinking: { type: "enabled" },
    reasoning_effort: "high",
    stream_options: { include_usage: true },
  });
  assert.equal(diag.messageCount, 2);
  assert.equal(diag.toolCount, 1);
  assert.equal(diag.thinkingType, "enabled");
  assert.equal(diag.reasoningEffort, "high");
  assert.equal(diag.assistantMissingReasoningContent, 1);
});

test("config parser accepts percent in 0..100 form", () => {
  const config = parseConfig({ contextWarnPct: 60, hugeResultCapper: true });
  assert.equal(config.contextWarnPct, 0.6);
  assert.equal(config.hugeResultCapper, true);
  assert.equal(config.dynamicProviderName, DEFAULT_CONFIG.dynamicProviderName);
});

test("config parser falls back and clamps invalid edge values", () => {
  for (const value of ["x", 1, [], null]) {
    assert.deepEqual(parseConfig(value), DEFAULT_CONFIG);
  }

  const empty = parseConfig({});
  assert.deepEqual(empty, DEFAULT_CONFIG);

  const parsed = parseConfig({
    enabled: "no",
    pruneOn: "invalid-value",
    pruneBatchSize: 999,
    pruneBridgeLength: 0,
    hugeResultChars: 500,
    statusBarStyle: "charts",
    minTurnsBetweenCompacts: -5,
    maxCompactsPerSession: 0,
    foldTimeoutMs: 50,
    skillPinConfirmThreshold: 0,
    foldThreshold: 150,
    contextFoldPct: 70,
  });
  assert.equal(parsed.enabled, DEFAULT_CONFIG.enabled);
  assert.equal(parsed.pruneOn, DEFAULT_CONFIG.pruneOn);
  assert.equal(parsed.pruneBatchSize, 20);
  assert.equal(parsed.pruneBridgeLength, 1);
  assert.equal(parsed.hugeResultChars, DEFAULT_CONFIG.hugeResultChars);
  assert.equal(parsed.statusBarStyle, DEFAULT_CONFIG.statusBarStyle);
  assert.equal(parsed.minTurnsBetweenCompacts, DEFAULT_CONFIG.minTurnsBetweenCompacts);
  assert.equal(parsed.maxCompactsPerSession, DEFAULT_CONFIG.maxCompactsPerSession);
  assert.equal(parsed.foldTimeoutMs, DEFAULT_CONFIG.foldTimeoutMs);
  assert.equal(parsed.skillPinConfirmThreshold, DEFAULT_CONFIG.skillPinConfirmThreshold);
  assert.equal(parsed.foldThreshold, 1.5);
  assert.equal(parsed.contextCompactPct, 0.7);

  const minValues = parseConfig({ pruneBatchSize: 0, pruneBridgeLength: 1, minTurnsBetweenCompacts: 0, foldTimeoutMs: 100, skillPinConfirmThreshold: 1 });
  assert.equal(minValues.pruneBatchSize, 1);
  assert.equal(minValues.pruneBridgeLength, 1);
  assert.equal(minValues.minTurnsBetweenCompacts, 0);
  assert.equal(minValues.foldTimeoutMs, 100);
  assert.equal(minValues.skillPinConfirmThreshold, 1);
});

test("config parser preserves all boolean fields", () => {
  const boolKeys = [
    "enabled", "diagnostics", "mutateSystemPrompt", "mutateProviderPayload", "registerDynamicProvider",
    "allowOverrideBuiltInDeepSeek", "hugeResultCapper", "prefixStabilityCheck", "prefixFingerprint",
    "toolFingerprint", "appendOnlyProjection", "autoCompactAtHighWatermark", "enableAgenticTools",
    "pruneEnabled", "pruneIncludeContext", "autoFold", "foldTool", "cachePromptInjection",
    "showCostSavings", "showCostBreakdown", "showSavings", "strictPrefixWarnings", "parallelReadTool",
    "statusLine", "persistDiagnostics", "checkpointStartsSegment", "skillPinning", "memoryInjection",
    "priorityInjection", "reasonixCompatibilityRoots", "autoDetectSkillPins", "autoPinFrequentSkills",
  ];
  const allFalse = Object.fromEntries(boolKeys.map((key) => [key, false]));
  const allTrue = Object.fromEntries(boolKeys.map((key) => [key, true]));

  for (const key of boolKeys) assert.equal(parseConfig(allFalse)[key], false, key);
  for (const key of boolKeys) assert.equal(parseConfig(allTrue)[key], true, key);
});


test("classifies pruner cache profiles", () => {
  assert.deepEqual(classifyPruner({ enabled: false }).cacheProfile, "risky");
  assert.deepEqual(classifyPruner({ enabled: true, pruneOn: "every-turn" }).cacheProfile, "bad");
  assert.match(classifyPruner({ enabled: true, pruneOn: "every-turn" }).cacheProfileReason, /prompt-cache churn/);
  assert.deepEqual(classifyPruner({ enabled: true, pruneOn: "agent-message", batchingMode: "agent-message" }).cacheProfile, "good");
  assert.deepEqual(classifyPruner({ enabled: true, pruneOn: "on-demand" }).cacheProfile, "good");
  assert.deepEqual(classifyPruner({ enabled: true, pruneOn: "agentic-auto" }).cacheProfile, "risky");
  assert.deepEqual(classifyPruner({ enabled: true, pruneOn: "agent-message", batchingMode: "every-turn" }).cacheProfile, "risky");
});

test("detects pi-context-prune commands/tools", () => {
  const status = detectPruner({
    getCommands: () => [{ name: "pruner", source: "extension" }],
    getAllTools: () => [{ name: "context_tree_query" }, { name: "context_prune" }],
    getActiveTools: () => [{ name: "context_prune" }],
  });
  assert.equal(status.installed, true);
  assert.equal(status.lookupTool, true);
  assert.equal(status.agenticToolRegistered, true);
  assert.equal(status.agenticToolActive, true);
  assert.equal(typeof status.cacheProfileReason, "string");
});

test("context percent and recommendations", () => {
  assert.equal(getContextPercent({ usedTokens: 60, contextWindow: 100 }), 0.6);
  const rec = recommendContextAction(0.73, DEFAULT_CONFIG);
  assert.equal(rec.level, "danger");
});

test("decision engine reads context usage shapes and boundary zones", () => {
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ promptTokens: 500, maxTokens: 1000 }) }), { ratio: 0.5, tokens: 500, max: 1000 });
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ tokens: 500, ctxMax: 1000 }) }), { ratio: 0.5, tokens: 500, max: 1000 });
  assert.equal(readContextUsage({ getContextUsage: () => ({ percent: 75 }) }).ratio, 0.75);
  assert.equal(readContextUsage({ getContextUsage: () => ({ pct: 0.55 }) }).ratio, 0.55);
  assert.equal(readContextUsage({ getContextUsage: () => ({ ratio: 0.8 }) }).ratio, 0.8);
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ usedTokens: 200, limit: 1000 }) }), { ratio: 0.2, tokens: 200, max: 1000 });
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ contextTokens: 300 }) }), { ratio: undefined, tokens: 300, max: undefined });
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ percent: 2 }) }), { ratio: 0.02, tokens: undefined, max: undefined });
  assert.equal(readContextUsage({ getContextUsage: () => ({ percent: 0.5 }) }).ratio, 0.5);
  assert.deepEqual(readContextUsage({ getContextUsage: () => ({ promptTokens: "abc", tokens: Infinity }) }), { ratio: undefined, tokens: undefined, max: undefined });
  assert.deepEqual(readContextUsage({ getContextUsage: () => null }), {});
  assert.deepEqual(readContextUsage({ getContextUsage: () => "bad" }), {});

  assert.equal(zoneForRatio(0.4, DEFAULT_CONFIG), "green");
  assert.equal(zoneForRatio(0.6, DEFAULT_CONFIG), "yellow");
  assert.equal(zoneForRatio(0.72, DEFAULT_CONFIG), "orange");
  assert.equal(zoneForRatio(0.82, DEFAULT_CONFIG), "red");
  assert.equal(zoneForRatio(0.95, DEFAULT_CONFIG), "critical");
  assert.equal(zoneForRatio(undefined, DEFAULT_CONFIG), "green");
  assert.equal(zoneForRatio(0, DEFAULT_CONFIG), "green");

  assert.equal(decideCompaction({ ratio: 0 }, DEFAULT_CONFIG), "hold");
  assert.equal(decideCompaction({ ratio: undefined }, DEFAULT_CONFIG), "hold");
  assert.equal(decideCompaction({ ratio: 0.75, hitRate: 0.3 }, DEFAULT_CONFIG), "fold");
  assert.equal(decideCompaction({ ratio: 0.71, hitRate: 0 }, DEFAULT_CONFIG), "hold");
});

test("post-usage and preflight decisions cover invalid and exact threshold inputs", () => {
  assert.deepEqual(decideAfterUsage(undefined, undefined, false, DEFAULT_CONFIG), { kind: "none", promptTokens: 0, ctxMax: 0, ratio: 0 });
  assert.deepEqual(decideAfterUsage(10, -1, false, DEFAULT_CONFIG), { kind: "none", promptTokens: 10, ctxMax: -1, ratio: 0 });
  assert.equal(decideAfterUsage(75, 100, false, DEFAULT_CONFIG).kind, "fold");
  assert.equal(decideAfterUsage(78, 100, false, DEFAULT_CONFIG).aggressive, true);
  assert.equal(decideAfterUsage(80, 100, false, DEFAULT_CONFIG).kind, "exit-with-summary");
  assert.equal(estimateTurnStart({ getContextUsage: () => ({ ratio: 0.91 }) }, DEFAULT_CONFIG).shouldFold, true);
  assert.equal(estimateTurnStart({ getContextUsage: () => ({ ratio: 0.89 }) }, DEFAULT_CONFIG).shouldFold, false);
  assert.deepEqual(estimateTurnStart({}, DEFAULT_CONFIG), { shouldFold: false, ratio: 0 });
});

test("model selection drift opens checkpoint segment with previous model", () => {
  const state = createRuntimeState({ model: { provider: "deepseek", id: "deepseek-v4-flash" } });
  state.stats.requests = 1;
  const checkpointCount = state.engine.checkpoints.length;
  const segmentCount = state.engine.segments.length;

  syncModelSelection({ model: { provider: "deepseek", id: "deepseek-r1" } }, state);

  assert.equal(state.engine.checkpoints.length, checkpointCount + 1);
  assert.equal(state.engine.segments.length, segmentCount + 1);
  const checkpoint = state.engine.checkpoints.at(-1);
  assert.equal(checkpoint.reason, "model_select");
  assert.equal(checkpoint.previousModelId, "deepseek-v4-flash");
  assert.equal(checkpoint.modelId, "deepseek-r1");
  assert.equal(state.engine.segments.at(-1).checkpointId, checkpoint.id);
});

test("syncModelSelection leaves checkpoints unchanged for same model and for first requestless selection", () => {
  const state = createRuntimeState({ model: { provider: "deepseek", id: "deepseek-v4-flash" } });
  const checkpointCount = state.engine.checkpoints.length;

  syncModelSelection({ model: { provider: "deepseek", id: "deepseek-v4-flash" } }, state);
  assert.equal(state.engine.checkpoints.length, checkpointCount);

  syncModelSelection({ model: { provider: "openrouter", id: "deepseek-v4-pro" } }, state);
  assert.equal(state.engine.checkpoints.length, checkpointCount);
  assert.equal(state.detection.modelId, "deepseek-v4-pro");
  assert.equal(state.detection.provider, "openrouter");
});

test("telemetry restore rebuilds prune indexer for provider-context pruning after reload", () => {
  const state = createRuntimeState();
  const restored = createRuntimeState();
  state.engine.prune.summarizedIds.push("tc-1", "tc-2");
  state.engine.prune.summarizedRecords = [
    { toolCallId: "tc-1", toolName: "read", turnIndex: 1, summarized: true, summaryText: "batch summary" },
    { toolCallId: "tc-2", toolName: "grep", turnIndex: 1, summarized: true },
  ];
  const entries = [{ type: "custom", customType: CUSTOM_TYPE_TELEMETRY, data: { version: 1, stats: state.stats, engine: { prune: state.engine.prune } } }];
  assert.equal(restoreTelemetryFromSession({ sessionManager: { getEntries: () => entries } }, restored), true);
  const pruned = pruneMessages([
    { role: "assistant", tool_calls: [{ id: "tc-1" }, { id: "tc-2" }] },
    { role: "tool", toolCallId: "tc-1", content: "large 1" },
    { role: "tool", toolCallId: "tc-2", content: "large 2" },
  ], restored.toolIndexer);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].role, "assistant");
});

test("context handler returns pruned messages so Pi standard context usage sees the rebuilt context", async () => {
  const state = createRuntimeState();
  state.toolIndexer.markSummarized("tc-1", "read", 1, "summary");
  const event = {
    messages: [
      { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] },
      { role: "toolResult", toolCallId: "tc-1", content: [{ type: "text", text: "large result" }] },
    ],
  };

  const result = await handleContext(event, {}, state);

  assert.ok(result);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, "assistant");
});

test("context handler projects semantic fold synthetic message plus live tail from branch", async () => {
  const state = createRuntimeState();
  state.engine.semanticFold.active = true;
  state.engine.semanticFold.syntheticMsg = { role: "assistant", content: "folded summary" };
  state.engine.semanticFold.tailStartEntryId = "tail-1";
  const result = await handleContext(
    { messages: [{ role: "system", content: "sys" }, { role: "user", content: "live tail should be ignored here" }] },
    {
      sessionManager: {
        getBranch: async () => [
          { id: "tail-2", message: { role: "assistant", content: "tail assistant" } },
          { id: "tail-1", message: { role: "user", content: "tail user" } },
          { id: "older", message: { role: "user", content: "old" } },
        ],
      },
    },
    state,
  );

  assert.deepEqual(result.messages, [
    { role: "system", content: "sys" },
    { role: "assistant", content: "folded summary" },
    { role: "user", content: "tail user" },
    { role: "assistant", content: "tail assistant" },
  ]);
});

test("context handler returns undefined when nothing changed and no projection applies", async () => {
  const state = createRuntimeState();
  const result = await handleContext({ messages: [{ role: "system", content: "sys" }] }, {}, state);
  assert.equal(result, undefined);
});

test("context handler returns only system plus synthetic message when semantic fold tail start is missing", async () => {
  const state = createRuntimeState();
  state.engine.semanticFold.active = true;
  state.engine.semanticFold.syntheticMsg = { role: "assistant", content: "folded summary" };
  state.engine.semanticFold.tailStartEntryId = "missing-tail";
  const result = await handleContext(
    { messages: [{ role: "system", content: "sys" }, { role: "user", content: "ignored" }] },
    { sessionManager: { getBranch: async () => [{ id: "other", message: { role: "user", content: "old tail" } }] } },
    state,
  );

  assert.deepEqual(result.messages, [
    { role: "system", content: "sys" },
    { role: "assistant", content: "folded summary" },
  ]);
});

test("context handler falls through safely when semantic fold branch lookup throws", async () => {
  const state = createRuntimeState();
  state.engine.semanticFold.active = true;
  state.engine.semanticFold.syntheticMsg = { role: "assistant", content: "folded summary" };
  const result = await handleContext(
    { messages: [{ role: "system", content: "sys" }] },
    { sessionManager: { getBranch: async () => { throw new Error("boom"); } } },
    state,
  );
  assert.deepEqual(result.messages, [
    { role: "system", content: "sys" },
    { role: "assistant", content: "folded summary" },
  ]);
});

test("context handler returns append-only projection when active", async () => {
  const state = createRuntimeState();
  state.config.appendOnlyProjection = true;
  state.engine.appendOnly.projectionActive = true;
  state.engine.appendOnly.stableSummary = { role: "assistant", content: "stable summary" };
  const result = await handleContext(
    {
      messages: [
        { role: "system", content: "sys" },
        { id: "e1", role: "user", content: "tail user" },
      ],
    },
    { ui: { notify: () => {} } },
    state,
  );

  assert.deepEqual(result.messages, [
    { role: "system", content: "sys" },
    { role: "assistant", content: "stable summary" },
    { id: "e1", role: "user", content: "tail user" },
  ]);
});

test("manual prune rebuild opens prune checkpoint exactly once for newly applied ids", async () => {
  const state = createRuntimeState();
  state.toolIndexer.markSummarized("tc-1", "read", 1, "summary");
  const ctx = {
    sessionManager: {
      getBranch: () => [
        { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-1" }] } },
        { type: "message", message: { role: "toolResult", toolCallId: "tc-1", content: "large result" } },
      ],
    },
  };

  const first = await rebuildPrunedContextFromSession(ctx, state, "manual test");
  const checkpointCount = state.engine.checkpoints.length;

  assert.equal(first.changed, true);
  assert.equal(first.newlyApplied.length, 1);
  assert.equal(first.checkpointOpened, true);
  assert.equal(state.engine.prune.pruneRunCount, 1);
  assert.equal(state.engine.checkpoints.at(-1).reason, "prune");
  assert.equal(state.engine.segments.at(-1).checkpointId, state.engine.checkpoints.at(-1).id);

  const second = await rebuildPrunedContextFromSession(ctx, state, "manual test");
  assert.equal(second.checkpointOpened, false);
  assert.equal(state.engine.prune.pruneRunCount, 1);
  assert.equal(state.engine.checkpoints.length, checkpointCount);
});

test("executePrune reports noneSummarized when summary model returns no usable output", async () => {
  const state = createRuntimeState();
  state.config.diagnostics = true;
  state.config.persistDiagnostics = true;
  const originalLang = process.env.LANG;
  try {
    process.env.LANG = "ru_RU.UTF-8";
    applyLocale(undefined);
    const entries = [];
    let completeOptions;
    const pi = {
      appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
      complete: async (_model, _messages, options) => {
        completeOptions = options;
        return { content: [{ type: "text", text: "" }] };
      },
    };
    const ctx = {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "tc-1", content: "large result" } },
        ],
      },
    };

    const result = await executePrune(pi, ctx, state.toolIndexer, state, "auto");

    assert.equal(result.details.reason, "none_summarized");
    assert.equal(result.details.summarized, 0);
    assert.equal(result.details.attempted, 1);
    assert.equal(result.details.summaryRequests, 1);
    assert.equal(result.details.error, "summary response was empty");
    assert.equal(completeOptions.reasoningEffort, undefined);
    assert.match(state.engine.prune.impact.lastSummarizePrompt, /Input JSON:/);
    assert.match(state.engine.prune.impact.lastSummarizePrompt, /"payload_kind": "tool_call_batches_v2"/);
    assert.equal(state.engine.prune.impact.lastSummarizeResponse, "");
    assert.equal(state.engine.prune.impact.lastError, "summary response was empty");
    assert.equal(entries.some((entry) => entry.customType === CUSTOM_TYPE_PRUNE_DEBUG && entry.data.error === "summary response was empty"), true);
    assert.equal(entries.some((entry) => entry.customType === CUSTOM_TYPE_TELEMETRY), true);
    assert.equal(result.text, t("tool.prune.noneSummarized"));
  } finally {
    process.env.LANG = originalLang;
    applyLocale(undefined);
  }
});

test("executePrune returns no_session without session manager", async () => {
  const result = await executePrune({}, {}, createRuntimeState().toolIndexer);
  assert.equal(result.details.reason, "no_session");
  assert.equal(result.text, t("tool.prune.error.noSession"));
});

test("executePrune marks tool calls with missing replayable results and persists skipped ids", async () => {
  const state = createRuntimeState();
  const result = await executePrune(
    { appendEntry: () => {} },
    {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-missing", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "tc-missing", content: "" } },
        ],
      },
    },
    state.toolIndexer,
    state,
    "auto",
  );

  assert.equal(result.details.reason, "missing_tool_results");
  assert.equal(result.details.missingResults, 1);
  assert.equal(result.details.summaryRequests, 0);
  assert.equal(state.engine.prune.skippedMissingResultIds.includes("tc-missing"), true);
  assert.equal(state.engine.prune.impact.lastError, "missing_tool_results");
});

test("executePrune interactive mode lists replayable tool calls without summarizing", async () => {
  const state = createRuntimeState();
  let completeCalled = false;
  const result = await executePrune(
    { complete: async () => { completeCalled = true; } },
    {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "tc-1", content: "file contents" } },
        ],
      },
    },
    state.toolIndexer,
    state,
    "interactive",
  );

  assert.equal(completeCalled, false);
  assert.equal(result.details.toolCalls.length, 1);
  assert.match(result.text, /read\(tc-1\)/);
});

test("executePrune uses ctx model for default summarizer, deduplicates emitted summaries, and works without runtime engine", async () => {
  const sent = [];
  const pi = {
    sendMessage: (message) => sent.push(message),
    complete: async (model) => {
      assert.equal(model, "deepseek-v4-flash");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            summaries: [
              { batchIndex: 0, coverage: "complete", evidence: ["one"], summary: "same summary" },
              { batchIndex: 1, coverage: "complete", evidence: ["one"], summary: "same summary" },
            ],
          }),
        }],
      };
    },
  };
  const result = await executePrune(
    pi,
    {
      model: { id: "deepseek-v4-flash" },
      sessionManager: {
        getBranch: () => [
          { type: "message", turnIndex: 1, message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", turnIndex: 1, message: { role: "toolResult", toolCallId: "tc-1", content: "a".repeat(200) } },
          { type: "message", turnIndex: 2, message: { role: "user", content: "next task" } },
          { type: "message", turnIndex: 2, message: { role: "assistant", tool_calls: [{ id: "tc-2", function: { name: "grep", arguments: "{}" } }] } },
          { type: "message", turnIndex: 2, message: { role: "toolResult", toolCallId: "tc-2", content: "b".repeat(200) } },
        ],
      },
    },
    createRuntimeState().toolIndexer,
    { config: { pruneModel: "default", pruneIncludeContext: false } },
    "auto",
  );

  assert.equal(result.details.summarized, 2);
  assert.equal(result.details.modelId, "deepseek-v4-flash");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].customType, "context-engine-prune-summary");
  assert.equal(sent[0].content, "Coverage: complete\nsame summary\n- Evidence: one");
});

test("executePrune uses explicit summarizer override and skips inefficient replacement summaries", async () => {
  const state = createRuntimeState();
  let usedModel;
  const result = await executePrune(
    {
      complete: async (model) => {
        usedModel = model;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              summaries: [
                { batchIndex: 0, coverage: "complete", evidence: ["one"], summary: "x".repeat(6000) },
              ],
            }),
          }],
        };
      },
      appendEntry: () => {},
    },
    {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-oversized", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "tc-oversized", content: "small result" } },
        ],
      },
    },
    state.toolIndexer,
    { ...state, config: { ...state.config, pruneModel: "custom-summarizer" } },
    "auto",
  );

  assert.equal(usedModel, "custom-summarizer");
  assert.equal(result.details.reason, "skipped_oversized");
  assert.equal(result.details.skippedOversized, 1);
});

test("executePrune reports empty or malformed summarizer responses without marking tools summarized", async () => {
  const variants = [
    { name: "null", response: null, error: "summary model returned no response", requests: 1 },
    { name: "undefined", response: undefined, error: "summary model returned no response", requests: 1 },
    { name: "empty content array", response: { content: [] }, error: "summary response was empty", requests: 1 },
    { name: "invalid JSON", response: { content: [{ type: "text", text: "{\"summaries\":[" }] }, error: "summary response did not contain usable structured summaries", requests: 1 },
  ];

  for (const variant of variants) {
    const state = createRuntimeState();
    const result = await executePrune(
      { complete: async () => variant.response },
      {
        sessionManager: {
          getBranch: () => [
            { type: "message", message: { role: "assistant", tool_calls: [{ id: `tc-${variant.name}`, function: { name: "read", arguments: "{}" } }] } },
            { type: "message", message: { role: "toolResult", toolCallId: `tc-${variant.name}`, content: "large result" } },
          ],
        },
      },
      state.toolIndexer,
      state,
      "auto",
    );

    assert.equal(result.details.reason, "none_summarized", variant.name);
    assert.equal(result.details.summarized, 0, variant.name);
    assert.equal(result.details.summaryRequests, variant.requests, variant.name);
    assert.equal(result.details.error, variant.error, variant.name);
    assert.equal(state.toolIndexer.isSummarized(`tc-${variant.name}`), false, variant.name);
  }
});

test("agent-message prune collects on turn_end and flushes on final assistant message_end", async () => {
  const state = createRuntimeState();
  state.config.pruneEnabled = true;
  state.config.pruneOn = "agent-message";
  state.config.pruneBatchSize = 1;
  state.config.pruneModel = "default";
  let completeCalls = 0;
  const pi = {
    complete: async () => {
      completeCalls++;
      return { content: [{ type: "text", text: JSON.stringify({ summaries: [{ batchIndex: 0, summary: "data" }] }) }] };
    },
    appendEntry: () => {},
    sendMessage: () => {},
  };
  const assistantWithTool = {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-agent-message", name: "read", input: { path: "x" } }],
  };
  const toolResult = {
    role: "toolResult",
    toolCallId: "tc-agent-message",
    content: [{ type: "text", text: "important data" }],
  };
  const branch = [
    { type: "message", message: assistantWithTool },
    { type: "message", message: toolResult },
  ];
  const ctx = {
    sessionManager: { getBranch: () => branch },
    ui: { notify: () => {} },
  };

  await handleTurnEnd({ turnIndex: 1, message: assistantWithTool, toolResults: [toolResult] }, pi, ctx, state);

  assert.equal(completeCalls, 0);
  assert.equal(state.engine.prune.pendingBatches.length, 1);
  assert.equal(state.engine.prune.awaitingAgentMessage, true);

  await handleMessageEnd({ message: { role: "assistant", content: [{ type: "text", text: "done" }] } }, pi, ctx, state);

  assert.equal(completeCalls, 1);
  assert.equal(state.engine.prune.pendingBatches.length, 0);
  assert.equal(state.engine.prune.batchStepCounter, 0);
  assert.equal(state.engine.prune.awaitingAgentMessage, false);
  assert.equal(state.engine.prune.summarizedIds.includes("tc-agent-message"), true);
});

test("handleTurnEnd uses event turnIndex when provided and increments otherwise", async () => {
  const state = createRuntimeState();
  state.config.enabled = false;
  await handleTurnEnd({ turnIndex: 7 }, {}, {}, state);
  assert.equal(state.engine.turnIndex, 7);
  await handleTurnEnd({}, {}, {}, state);
  assert.equal(state.engine.turnIndex, 8);
});

test("handleMessageEnd delegates safely for non-assistant events", async () => {
  const state = createRuntimeState();
  state.config.pruneEnabled = true;
  state.config.pruneOn = "agent-message";
  state.engine.prune.pendingBatches.push({ turnIndex: 1, toolCalls: [{ id: "tc-1", name: "read", turnIndex: 1, result: "x" }] });
  await handleMessageEnd({ message: { role: "user", content: "not assistant" } }, {}, {}, state);
  assert.equal(state.engine.prune.pendingBatches.length, 1);
});

test("captureTurnEndBatch preserves lookup details when restored session result body is empty", () => {
  const pruneState = { pendingBatches: [] };
  const count = captureTurnEndBatch(
    {
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "lookup-1", name: "context_result_lookup", input: { ref: "dsc-x", offset: 12000, limit: 700 } }],
      },
      toolResults: [{
        role: "toolResult",
        toolCallId: "lookup-1",
        toolName: "context_result_lookup",
        content: [{ type: "text", text: "" }],
        details: { ref: "dsc-x", offset: 12000, limit: 700, returnedChars: 0, bytes: 12666, found: true },
      }],
    },
    [],
    pruneState,
    4,
  );

  assert.equal(count, 1);
  assert.equal(pruneState.pendingBatches.length, 1);
  assert.equal(pruneState.pendingBatches[0].toolCalls[0].result, "[context_result_lookup ref=dsc-x offset=12000 limit=700 returned=0 bytes=12666 found=true]");
});

test("captureTurnEndBatch deduplicates skip ids and already pending tool ids", () => {
  const pruneState = {
    pendingBatches: [{
      turnIndex: 1,
      toolCalls: [{ id: "pending-1", name: "read", turnIndex: 1, result: "existing result" }],
    }],
  };
  const count = captureTurnEndBatch(
    {
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "skip-me", name: "read", input: { path: "a.ts" } },
          { type: "toolCall", id: "pending-1", name: "read", input: { path: "b.ts" } },
          { type: "toolCall", id: "fresh-1", name: "read", input: { path: "c.ts" } },
        ],
      },
      toolResults: [
        { role: "toolResult", toolCallId: "skip-me", content: "skip body" },
        { role: "toolResult", toolCallId: "pending-1", content: "duplicate body" },
        { role: "toolResult", toolCallId: "fresh-1", content: "fresh body" },
      ],
    },
    ["skip-me"],
    pruneState,
    5,
  );

  assert.equal(count, 1);
  assert.equal(pruneState.pendingBatches.length, 2);
  assert.deepEqual(pruneState.pendingBatches[1].toolCalls.map((tc) => tc.id), ["fresh-1"]);
});

test("registerPruneTool wires tool execution through executePrune", async () => {
  const state = createRuntimeState();
  let registered;
  registerPruneTool({ registerTool: (tool) => { registered = tool; } }, state.toolIndexer, state);
  assert.equal(registered.name, "context_prune");

  const result = await registered.execute(
    "call-1",
    { mode: "interactive" },
    new AbortController().signal,
    undefined,
    {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "assistant", tool_calls: [{ id: "tc-1", function: { name: "read", arguments: "{}" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "tc-1", content: "x" } },
        ],
      },
    },
  );

  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /read\(tc-1\)/);
  assert.equal(result.details.toolCalls.length, 1);
});

test("syncPruneToolActivation adds and removes context_prune only for agentic-auto", () => {
  const calls = [];
  const pi = {
    active: ["read"],
    getActiveTools() { return [...this.active]; },
    setActiveTools(next) { this.active = [...next]; calls.push([...next]); },
  };

  syncPruneToolActivation(pi, { enabled: true, pruneOn: "agentic-auto" });
  assert.deepEqual(pi.active, ["read", "context_prune"]);

  syncPruneToolActivation(pi, { enabled: true, pruneOn: "on-demand" });
  assert.deepEqual(pi.active, ["read"]);
  assert.equal(calls.length >= 2, true);
});

test("syncPruneToolActivation ignores runtime-not-initialized errors and rethrows other failures", () => {
  syncPruneToolActivation({
    getActiveTools() { throw new Error("runtime not initialized"); },
    setActiveTools() {},
  }, { enabled: true, pruneOn: "agentic-auto" });

  assert.throws(
    () => syncPruneToolActivation({
      getActiveTools() { throw new Error("boom"); },
      setActiveTools() {},
    }, { enabled: true, pruneOn: "agentic-auto" }),
    /boom/,
  );
});

test("handleSessionBeforeCompact stays inert when extension is disabled", () => {
  const state = createRuntimeState();
  state.config.enabled = false;
  assert.equal(handleSessionBeforeCompact({}, {}, state), undefined);
});

test("handleSessionBeforeCompact stays inert when extension is enabled", () => {
  const state = createRuntimeState();
  assert.equal(handleSessionBeforeCompact({}, {}, state), undefined);
});

test("telemetry restore preserves prune impact trace fields after reload", () => {
  const state = createRuntimeState();
  const restored = createRuntimeState();
  state.engine.prune.impact = {
    summarizeRequests: 2,
    summarizeInputTokens: 1234,
    summarizeOutputTokens: 210,
    summarizeCost: 0.0012,
    summarizeToolCalls: 5,
    summarizeRawChars: 6000,
    summarizeSummaryChars: 900,
    postPruneRequests: 1,
    postPruneMissTokens: 321,
    postPruneCacheReadTokens: 4567,
    postPruneMissCost: 0.00012,
    lastSummarizePrompt: "prompt body",
    lastSummarizeResponse: "{\"summaries\":[]}",
    lastAcceptedSummaries: ["summary one"],
    lastSummarizeMaxTokens: 256,
    lastSummarizeRawChars: 3200,
    lastSummarizeSummaryChars: 480,
    lastSummarizeCost: 0.0003,
    lastSummarizeToolCalls: 2,
    lastPostPruneHitRate: 0.99,
    lastPostPruneMissTokens: 12,
    lastPostPruneMissCost: 0.00001,
  };
  const entries = [{
    type: "custom",
    customType: CUSTOM_TYPE_TELEMETRY,
    data: {
      version: 1,
      stats: state.stats,
      engine: { prune: state.engine.prune },
    },
  }];
  assert.equal(restoreTelemetryFromSession({ sessionManager: { getEntries: () => entries } }, restored), true);
  assert.equal(restored.engine.prune.impact.lastSummarizePrompt, "prompt body");
  assert.equal(restored.engine.prune.impact.lastSummarizeResponse, "{\"summaries\":[]}");
  assert.deepEqual(restored.engine.prune.impact.lastAcceptedSummaries, ["summary one"]);
  assert.equal(restored.engine.prune.impact.lastSummarizeMaxTokens, 256);
  assert.equal(restored.engine.prune.impact.lastPostPruneHitRate, 0.99);
  assert.equal(restored.engine.prune.impact.lastPostPruneMissTokens, 12);
});

test("telemetry restore hydrates latest prune debug trace when telemetry lacks it", () => {
  const state = createRuntimeState();
  const restored = createRuntimeState();
  const entries = [
    {
      type: "custom",
      customType: CUSTOM_TYPE_TELEMETRY,
      data: {
        version: 1,
        stats: state.stats,
        engine: { prune: state.engine.prune },
      },
    },
    {
      type: "custom",
      customType: CUSTOM_TYPE_PRUNE_DEBUG,
      data: {
        version: 1,
        prompt: "debug prompt",
        response: "debug response",
        acceptedSummaries: ["accepted"],
        maxTokens: 512,
        error: "debug error",
      },
    },
  ];
  assert.equal(restoreTelemetryFromSession({ sessionManager: { getEntries: () => entries } }, restored), true);
  assert.equal(restored.engine.prune.impact.lastSummarizePrompt, "debug prompt");
  assert.equal(restored.engine.prune.impact.lastSummarizeResponse, "debug response");
  assert.deepEqual(restored.engine.prune.impact.lastAcceptedSummaries, ["accepted"]);
  assert.equal(restored.engine.prune.impact.lastSummarizeMaxTokens, 512);
  assert.equal(restored.engine.prune.impact.lastError, "debug error");
});

test("telemetry restore clears legacy pendingSummaries state", () => {
  const state = createRuntimeState();
  const restored = createRuntimeState();
  state.engine.prune.pendingSummaries = ["old summary", "another stale summary"];
  const entries = [{
    type: "custom",
    customType: CUSTOM_TYPE_TELEMETRY,
    data: {
      version: 1,
      stats: state.stats,
      engine: { prune: state.engine.prune },
    },
  }];
  assert.equal(restoreTelemetryFromSession({ sessionManager: { getEntries: () => entries } }, restored), true);
  assert.deepEqual(restored.engine.prune.pendingSummaries, []);
});

test("savingsFromRealCost uses Pi cache-aware usage.cost as source of truth", () => {
  const modelCost = { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 };
  const usage = { input: 100, cacheRead: 900, cacheWrite: 0, output: 500, cost: 0.000154 };
  // no-cache: 1000 input * .14 + 500 output * .28 = $0.00028
  assert.equal(Math.round(savingsFromRealCost(usage, modelCost) * 1_000_000), 126);
  assert.equal(savingsFromRealCost({ ...usage, cost: undefined }, modelCost), 0);
});

test("costToCompact estimates additional miss cost versus cached current cost", () => {
  assert.equal(Math.round(costToCompact(
    { input: 1000, cacheRead: 900, cacheWrite: 100 },
    { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 },
  ) * 1_000_000), 137);
  assert.equal(costToCompact(undefined, { input: 0.14, cacheRead: 0.0028 }), 0);
});

test("DeepSeek fallback pricing matches official pricing page", () => {
  assert.deepStrictEqual(deepSeekOfficialCost("deepseek-v4-flash"), { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 });
  assert.deepEqual(deepSeekOfficialCost("deepseek-v4-pro"), { input: 0.435, cacheRead: 0.003625, cacheWrite: 0, output: 0.87 });
  assert.equal(Math.round(cacheSavingsUsd("deepseek-v4-flash", 1_000_000) * 1_000_000), 137200);
  assert.equal(Math.round(cacheSavingsUsd("deepseek-v4-pro", 1_000_000) * 1_000_000), 431375);
});

test("hit ratio uses provider formula cacheRead / (input + cacheRead + cacheWrite)", () => {
  assert.equal(computeHitRatio(100, 900, 0), 0.9);
  assert.equal(computeHitRatio(100, 50, 50), 0.25);
  assert.equal(computeHitRatio(0, 50, 0), 1);
  assert.equal(computeHitRatio(0, 0, 0), 0);
});

test("cache fold helpers estimate tokens, hash deterministically, and avoid placeholder boundary overrides", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("x".repeat(100)), 25);
  assert.equal(simpleHash("a"), simpleHash("a"));
  assert.notEqual(simpleHash("a"), simpleHash("b"));
  const entries = [
    { entryId: "e1", content: "a".repeat(400) },
    { entryId: "e2", content: "b".repeat(400) },
    { entryId: "e3", content: "c".repeat(400) },
    { entryId: "e4", content: "d".repeat(400) },
  ];
  assert.equal(maybeAdjustCutForCache(entries, 3, 0.5), undefined);
});

test("prefix extraction canonicalizes tools and ignores order noise", () => {
  const a = { payload: { model: "m", messages: [{ role: "system", content: "s" }], tools: [
    { function: { name: "b", description: "B", parameters: { type: "object" } } },
    { function: { name: "a", description: "A", parameters: { type: "object" } } },
  ], temperature: 0 } };
  const b = { payload: { ...a.payload, tools: [a.payload.tools[1], a.payload.tools[0]] } };
  assert.deepEqual(normalizeTools(a.payload.tools).map((tool) => tool.name), ["a", "b"]);
  assert.deepEqual(extractCachePrefix(a, {}).toolsHash, extractCachePrefix(b, {}).toolsHash);
});

test("prefix extraction ignores append-only chat tail and volatile request fields", () => {
  const base = { payload: {
    model: "deepseek-v4-flash",
    messages: [{ role: "system", content: "stable" }],
    tools: [{ function: { name: "read", description: "Read", parameters: { type: "object" } } }],
    reasoning_effort: "high",
    temperature: 0.2,
    request_id: "a",
    stream: true,
  } };
  const appended = { payload: {
    ...base.payload,
    request_id: "b",
    created_at: Date.now(),
    stream: false,
    messages: [
      ...base.payload.messages,
      { role: "user", content: "new question" },
      { role: "assistant", content: "answer" },
      { role: "tool", content: "tool output" },
    ],
  } };
  assert.deepEqual(extractCachePrefix(appended, {}), extractCachePrefix(base, {}));
});

test("provider prefix handler treats chat append and tool order as stable", () => {
  const state = createRuntimeState();
  state.config.prefixStabilityCheck = false;
  const notifications = [];
  const ctx = { ui: { notify: (...args) => notifications.push(args) } };
  const first = { payload: { model: "m", messages: [{ role: "system", content: "s" }], tools: [
    { function: { name: "b", description: "B", parameters: { type: "object" } } },
    { function: { name: "a", description: "A", parameters: { type: "object" } } },
  ], temperature: 0 } };
  const second = { payload: { ...first.payload, tools: [first.payload.tools[1], first.payload.tools[0]], messages: [
    ...first.payload.messages,
    { role: "user", content: "u" },
    { role: "assistant", content: "a" },
  ] } };
  handleProviderPrefix(first, ctx, state);
  state.engine.turnIndex = 1;
  handleProviderPrefix(second, ctx, state);
  assert.equal(state.engine.prefixDriftCount, 0);
  assert.equal(state.engine.toolHashChanges, 0);
  assert.equal(notifications.length, 0);
});

test("provider prefix handler emits no warnings for normal chat append", () => {
  const state = createRuntimeState();
  const notifications = [];
  const ctx = { ui: { notify: (...args) => notifications.push(args) } };
  const base = { payload: { model: "m", messages: [{ role: "system", content: "s" }, { role: "user", content: "one" }], tools: [], temperature: 0 } };
  handleProviderPrefix(base, ctx, state);
  state.engine.turnIndex = 1;
  handleProviderPrefix({ payload: { ...base.payload, messages: [...base.payload.messages, { role: "assistant", content: "answer" }, { role: "user", content: "two" }] } }, ctx, state);
  assert.equal(state.engine.prefixDriftCount, 0);
  assert.equal(notifications.length, 0);
});

test("provider prefix handler records hard drift reason and suppresses repeat warnings", () => {
  const state = createRuntimeState();
  state.config.strictPrefixWarnings = true;
  const notifications = [];
  const ctx = { ui: { notify: (...args) => notifications.push(args) } };
  handleProviderPrefix({ payload: { model: "m", messages: [{ role: "system", content: "s1" }] } }, ctx, state);
  state.engine.turnIndex = 1;
  handleProviderPrefix({ payload: { model: "m", messages: [{ role: "system", content: "s2" }] } }, ctx, state);
  assert.equal(state.engine.prefixDriftCount, 1);
  assert.equal(state.engine.lastPrefixChangeReason, "system");
  assert.equal(state.engine.lastPrefixNotificationSuppressed, false);
  assert.equal(state.engine.lastPrefixWarningReason, "system");
  assert.equal(state.engine.lastPrefixWarningTurn, 1);
  assert.equal(notifications.length, 1);

  state.engine.turnIndex = 2;
  handleProviderPrefix({ payload: { model: "m", messages: [{ role: "system", content: "s3" }] } }, ctx, state);
  assert.equal(state.engine.prefixDriftCount, 2);
  assert.equal(state.engine.lastPrefixChangeReason, "system");
  assert.equal(state.engine.lastPrefixNotificationSuppressed, true);
  assert.equal(notifications.length, 1);
});

test("prefix diff reports exact cache-relevant change reasons", () => {
  const prev = { model: "m1", systemHash: "s1", toolsHash: "t1", reasoning: "low", temperature: 0 };
  assert.deepEqual(diffPrefix(prev, { ...prev, model: "m2" }), { hard: true, reasons: ["model"] });
  assert.deepEqual(diffPrefix(prev, { ...prev, systemHash: "s2" }), { hard: true, reasons: ["system"] });
  assert.deepEqual(diffPrefix(prev, { ...prev, toolsHash: "t2" }), { hard: true, reasons: ["tools"] });
  assert.deepEqual(diffPrefix(prev, { ...prev, reasoning: "high" }), { hard: false, reasons: ["reasoning"] });
  assert.deepEqual(diffPrefix(prev, { ...prev, temperature: 0.7 }), { hard: false, reasons: [] });
});

test("prefix diff and warning policy suppress repeated same reason", () => {
  const prev = { model: "m", systemHash: "s1", toolsHash: "t", reasoning: "", temperature: 0 };
  const next = { ...prev, systemHash: "s2" };
  const drift = diffPrefix(prev, next);
  assert.deepEqual(drift, { hard: true, reasons: ["system"] });
  const state = { engine: { turnIndex: 1, lastPrefixWarningReason: "system", lastPrefixWarningTurn: 0 } };
  assert.equal(shouldNotifyPrefixDrift(state, drift), false);
  state.engine.turnIndex = 10;
  assert.equal(shouldNotifyPrefixDrift(state, drift), true);
});

test("stableHash is deterministic and detects tool schema drift", () => {
  const base = { tools: [{ name: "read", input_schema: { type: "object" } }] };
  const same = { tools: [{ input_schema: { type: "object" }, name: "read" }] };
  const changed = { tools: [{ name: "read", input_schema: { type: "object", properties: { path: { type: "string" } } } }] };
  assert.equal(stableHash(base), stableHash(same));
  assert.notEqual(stableHash(base), stableHash(changed));
});

test("stableHash covers nested, long-key, special-key, and cyclic inputs", () => {
  const nestedA = { z: [{ b: 2, a: { "weird.key[]": "value", long: "x".repeat(2000) } }] };
  const nestedB = { z: [{ a: { long: "x".repeat(2000), "weird.key[]": "value" }, b: 2 }] };
  assert.equal(stableHash(nestedA), stableHash(nestedB));
  assert.notEqual(stableHash(nestedA), stableHash({ z: [{ a: { long: "x".repeat(1999), "weird.key[]": "value" }, b: 2 }] }));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => stableHash(cyclic), RangeError);
});

test("decision engine matches cache-first thresholds", () => {
  const cfg = DEFAULT_CONFIG;
  assert.equal(decideCompaction({ ratio: 0.50, hitRate: 0.0 }, cfg), "hold");
  assert.equal(decideCompaction({ ratio: 0.71, hitRate: 0.95 }, cfg), "hold");
  assert.equal(decideCompaction({ ratio: 0.73, hitRate: 0.95 }, cfg), "advise");
  assert.equal(decideCompaction({ ratio: 0.76, hitRate: 0.80 }, cfg), "fold");
  assert.equal(decideCompaction({ ratio: 0.76, hitRate: 0.95 }, cfg), "advise");
  assert.equal(decideCompaction({ ratio: 0.83, hitRate: 0.95 }, cfg), "fold");
  assert.equal(decideCompaction({ ratio: 0.96, hitRate: 0.95 }, cfg), "force_fold");
});

test("canCompactNow enforces cooldown and max session compacts", () => {
  const base = {
    config: { ...DEFAULT_CONFIG, minTurnsBetweenCompacts: 3, maxCompactsPerSession: 2 },
    engine: { turnIndex: 10, compactCount: 0 },
  };
  assert.equal(canCompactNow(base), true);
  assert.equal(canCompactNow({ ...base, engine: { turnIndex: 11, lastCompactTurn: 10, compactCount: 1 } }), false);
  assert.equal(canCompactNow({ ...base, engine: { turnIndex: 13, lastCompactTurn: 10, compactCount: 1 } }), true);
  assert.equal(canCompactNow({ ...base, engine: { turnIndex: 20, lastCompactTurn: 10, compactCount: 2 } }), false);
});

test("parallel read wrapper registers only when extension and wrapper are enabled", () => {
  const registered = [];
  registerParallelReadTool({ registerTool: (tool) => registered.push(tool.name) }, { config: { enabled: false, parallelReadTool: true } });
  registerParallelReadTool({ registerTool: (tool) => registered.push(tool.name) }, { config: { enabled: true, parallelReadTool: false } });
  assert.deepEqual(registered, []);
  registerParallelReadTool({ registerTool: (tool) => registered.push(tool.name) }, { config: { enabled: true, parallelReadTool: true } });
  assert.deepEqual(registered, ["context_parallel_read"]);
});

test("tool call repair is read-specific and duplicate suppression window is bounded", () => {
  const state = createRuntimeState();
  const invalidRead = handleToolCall({ toolName: "read", input: {} }, {}, state);
  assert.equal(invalidRead.block, true);
  assert.match(invalidRead.reason, /Invalid tool arguments|Неверные аргументы/);

  const nonRead = { toolName: "bash", input: {} };
  assert.equal(handleToolCall(nonRead, {}, state), undefined);
  const read = { toolName: "read", input: { file: "a.ts" } };
  assert.equal(handleToolCall(read, {}, state), undefined);
  assert.deepEqual(read.input, { path: "a.ts" });
  assert.equal(handleToolCall({ toolName: "read", input: { path: "a.ts" } }, {}, state).block, true);
  state.engine.turnIndex = 2;
  assert.equal(handleToolCall({ toolName: "read", input: { path: "a.ts" } }, {}, state), undefined);
});

test("detectTextualToolCall flags explicit prose tool calls and avoids provider/definition false positives", () => {
  assert.equal(detectTextualToolCall({ content: "I will call tool read now" }), true);
  assert.equal(detectTextualToolCall({ content: "I will call the tool now" }), true);
  assert.equal(detectTextualToolCall({ content: "запусти инструмент search_code" }), true);
  assert.equal(detectTextualToolCall({ content: "Вызови функцию get_weather" }), true);
  assert.equal(detectTextualToolCall({ content: "используй функцию context_result_lookup" }), true);
  assert.equal(detectTextualToolCall({ content: "function call: read({ path: 'a.ts' })" }), true);
  assert.equal(detectTextualToolCall({ content: "normal answer" }), false);
  assert.equal(detectTextualToolCall({ content: "This answer explains what a function call is." }), false);
  assert.equal(detectTextualToolCall({ content: "вот пример вызова search_code" }), false);
  assert.equal(detectTextualToolCall({ content: "If the tool schema has offset and limit, I can call it like:\n```json\n{\"name\":\"context_result_lookup\",\"parameters\":{\"ref\":\"dsc-1\",\"offset\":0,\"limit\":100}}\n```" }), false);
  assert.equal(detectTextualToolCall({ content: "Да, смогу вызывать context_result_lookup({ ref: \"dsc-1\", offset: 0, limit: 100 }) как пример." }), false);
  assert.equal(detectTextualToolCall({ content: "tool_call", toolCalls: [{ name: "read" }] }), false);
});

test("huge result capper elides only above threshold and preserves recovery details", async () => {
  const store = new HugeResultStore();
  const disabled = { ...DEFAULT_CONFIG, hugeResultCapper: false, hugeResultChars: 10, hugeResultHeadChars: 4, hugeResultTailChars: 4 };
  const fullResult = "head|slice|tail";
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: fullResult }], toolCallId: "1", toolName: "bash" }, disabled, store), undefined);

  const config = { ...disabled, hugeResultCapper: true };
  const result = maybeCapToolResult({ content: [{ type: "text", text: fullResult }], toolCallId: "1", toolName: "bash" }, config, store);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, new RegExp(MODEL_VISIBLE_CONTEXT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.content[0].text, new RegExp(`<model_visible_context schema="${MODEL_VISIBLE_CONTEXT_SCHEMA}" kind="context_result_truncated" ui="custom-rendered">`));
  assert.match(result.content[0].text, /<instructions>\nThis is segment 1\/2 of a 15-byte tool output; configured segment size is 10 chars\./);
  assert.ok(result.content[0].text.indexOf("<instructions>") < result.content[0].text.indexOf("<metadata>"));
  assert.match(result.content[0].text, /Next segment: call context_result_lookup with ref="dsc-bash-1", offset=10, limit=10; 1 segment\(s\) remain\./);
  assert.match(result.content[0].text, /<metadata>/);
  assert.match(result.content[0].text, /"recovery":/);
  assert.match(result.content[0].text, /"tool": "context_result_lookup"/);
  assert.match(result.content[0].text, /"limit": 10/);
  assert.match(result.content[0].text, /This is segment 1\//);
  assert.match(result.content[0].text, /configured segment size is \d+ chars/);
  assert.match(result.content[0].text, /Next segment: call context_result_lookup with ref="dsc-bash-1", offset=\d+, limit=\d+; \d+ segment\(s\) remain/);
  assert.match(result.content[0].text, /"arguments":/);
  assert.match(result.content[0].text, /dsc-bash-1/);
  assert.match(result.content[0].text, /\[context_result_lookup kind=slice ref=dsc-bash-1 offset=0 limit=15 range=0:15 returned_chars=15 total_chars=15 bytes=15 has_more=false\]/);
  assert.deepEqual(result.details, { elidedBy: "pi-context-engine", ref: "dsc-bash-1", bytes: 15 });
  const record = store.get("dsc-bash-1");
  assert.equal(record.toolCallId, "1");
  assert.equal(record.toolName, "bash");
  const preview = buildPreview(record, config);
  assert.match(preview, /head/);
  assert.match(preview, /tail/);

  let lookupTool;
  registerLookupTool({ registerTool: (tool) => { lookupTool = tool; } }, store);
  const lookup = await lookupTool.execute("lookup-1", { ref: "dsc-bash-1" });
  assert.equal(lookup.details.found, true);
  assert.equal(lookup.content[0].text, `[context_result_lookup kind=full ref=dsc-bash-1 offset=0 range=0:15 returned_chars=15 total_chars=15 bytes=15 has_more=false]\n${fullResult}`);
  const partialLookup = await lookupTool.execute("lookup-1", { ref: "dsc-bash-1", offset: 5, limit: 5 });
  assert.equal(partialLookup.content[0].text, "[context_result_lookup kind=slice ref=dsc-bash-1 offset=5 limit=5 range=5:10 returned_chars=5 total_chars=15 bytes=15 has_more=true next_offset=10]\nslice");
  assert.equal(partialLookup.details.offset, 5);
  assert.equal(partialLookup.details.limit, 5);
  const theme = { fg: (_name, value) => value, bold: (value) => value };
  const collapsedLookup = lookupTool.renderResult(partialLookup, { expanded: false }, theme).text;
  assert.match(collapsedLookup, /dsc-bash-1 · chars 5-10 \/ 15 chars · limit 5/);
  assert.match(collapsedLookup, /slice/);
  assert.doesNotMatch(collapsedLookup, /\[context_result_lookup kind=slice/);
  const expandedLookup = lookupTool.renderResult(partialLookup, { expanded: true }, theme).text;
  assert.equal(expandedLookup.trim(), "slice");
  assert.doesNotMatch(expandedLookup, /\[context_result_lookup kind=slice/);
  assert.equal(maybeCapToolResult({ ...lookup, toolCallId: "lookup-1", toolName: "context_result_lookup" }, config, store), undefined);
  const collapsedPreview = renderStoredHugeResult(result, false, theme, store).text;
  assert.doesNotMatch(collapsedPreview, /Truncated result/);
  assert.doesNotMatch(collapsedPreview, /<instructions>/);
  const missing = await lookupTool.execute("lookup-2", { ref: "missing" });
  assert.equal(missing.details.found, false);
});

test("huge result capper uses configured char threshold instead of preview or byte length", () => {
  const store = new HugeResultStore();
  const config = { ...DEFAULT_CONFIG, hugeResultCapper: true, hugeResultChars: 4, hugeResultHeadChars: 1, hugeResultTailChars: 1 };

  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "abcd" }], toolCallId: "1", toolName: "bash" }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "абвг" }], toolCallId: "2", toolName: "bash" }, config, store), undefined);

  const capped = maybeCapToolResult({ content: [{ type: "text", text: "abcde" }], toolCallId: "3", toolName: "bash" }, config, store);
  assert.ok(capped);
  assert.match(capped.content[0].text, /configured segment size is 4 chars/);
  assert.match(capped.content[0].text, /Next segment: call context_result_lookup with ref="dsc-bash-1", offset=4, limit=4/);
  assert.match(capped.content[0].text, /"limit": 4/);
});

test("huge result model instruction avoids cutout wording when preview contains the full result", () => {
  const store = new HugeResultStore();
  const completeOutput = "full command log";
  const record = store.remember(completeOutput, "1", "bash");
  const text = buildPreview(record, { ...DEFAULT_CONFIG, hugeResultChars: 20, hugeResultHeadChars: 20, hugeResultTailChars: 0 });

  assert.match(text, /<instructions>\nThis is the complete tool output \(16 bytes\); no other segments exist\./);
  assert.match(text, /Stored ref dsc-bash-1 may be used later to revisit the same content/);
  assert.doesNotMatch(text, /segment 1\//);
  assert.doesNotMatch(text, /remaining slices/);
  assert.doesNotMatch(text, /not the full file\/output/);
  assert.equal(store.get("dsc-bash-1").text, completeOutput);
});

test("huge result capper bounds inline preview by configured segment size", () => {
  const store = new HugeResultStore();
  const result = maybeCapToolResult(
    { content: [{ type: "text", text: "x".repeat(70_000) }], toolCallId: "1", toolName: "bash" },
    { ...DEFAULT_CONFIG, hugeResultChars: 10_000, hugeResultHeadChars: 6_000, hugeResultTailChars: 6_000 },
    store,
  );
  assert.ok(result);
  const preview = result.content[0].text.match(/<payload name="preview">\n([\s\S]*?)\n<\/payload>/)?.[1] ?? "";
  assert.ok(preview.length <= 10_100);
  assert.match(result.content[0].text, /configured segment size is 10000 chars/);
  assert.match(result.content[0].text, /"tool": "context_result_lookup"/);
});

test("huge result refs persist and restore across session reload", () => {
  const entries = [];
  const store = new HugeResultStore((record) => persistHugeResult({ appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }) }, record));
  const result = maybeCapToolResult(
    { content: [{ type: "text", text: "persisted".repeat(10_000) }], toolCallId: "1", toolName: "read" },
    { ...DEFAULT_CONFIG, hugeResultChars: 100 },
    store,
  );
  assert.equal(result.details.ref, "dsc-read-1");
  assert.equal(entries[0].customType, CUSTOM_TYPE_HUGE_RESULT);

  const restored = new HugeResultStore();
  const restoredCount = restoreHugeResultsFromSession({ sessionManager: { getEntries: () => entries } }, restored);
  assert.equal(restoredCount, 1);
  assert.equal(restored.get("dsc-read-1").text, "persisted".repeat(10_000));
});

test("huge result store uses fallback slug, truncates long tool slugs, and ignores invalid restored records", () => {
  const store = new HugeResultStore();
  const fallback = store.remember("hello world");
  assert.equal(fallback.ref, "dsc-result-1");

  const long = store.remember("x", "2", "Very_Long Tool Name With Extra Noise 1234567890");
  assert.match(long.ref, /^dsc-very-long-tool-name--2$/);

  store.restore({ ref: "dsc-read-zz", text: 123 });
  assert.equal(store.get("dsc-read-zz"), undefined);
});

test("huge result capper recognizes lookup result shapes without toolName", () => {
  const store = new HugeResultStore();
  const config = { ...DEFAULT_CONFIG, hugeResultCapper: true, hugeResultChars: 100 };
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "x".repeat(1000) }], details: { ref: "dsc-1", found: true } }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "x".repeat(1000) }], result: { details: { ref: "dsc-1", found: true } } }, config, store), undefined);
});

test("huge result capper ignores empty and non-text result shapes", () => {
  const store = new HugeResultStore();
  const config = { ...DEFAULT_CONFIG, hugeResultCapper: true, hugeResultChars: 1 };
  assert.equal(maybeCapToolResult({ content: "" }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: [{ type: "image", data: "abc" }] }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "" }] }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: { type: "text", text: "abc" } }, config, store), undefined);
});

test("huge result preview renderer shows first output and expands from local store", () => {
  const store = new HugeResultStore();
  const record = store.remember(["first", "second", "third"].join("\n"), "1", "read");
  const result = {
    content: [{ type: "text", text: `${MODEL_VISIBLE_CONTEXT_MARKER}\n<model_visible_context schema="${MODEL_VISIBLE_CONTEXT_SCHEMA}" kind="context_result_truncated" ui="custom-rendered">\n<metadata>\n{"kind":"context_result_truncated","ref":"${record.ref}"}\n</metadata>\n<payload name="preview">\nfirst\n</payload>\n</model_visible_context>` }],
    details: { elidedBy: "pi-context-engine", ref: record.ref, bytes: record.bytes },
  };
  const theme = { fg: (_name, value) => value };
  const collapsed = renderStoredHugeResult(result, false, theme, store).text;
  const expanded = renderStoredHugeResult(result, true, theme, store).text;
  assert.match(collapsed, /first/);
  assert.match(expanded, /third/);
  assert.match(collapsed, /context_result_lookup \[ref=dsc-read-1\]/);
  assert.doesNotMatch(expanded, /context_result_lookup/);
  assert.match(collapsed, /\[ref dsc-read-1\]/);
});

test("lookup tool handles offset past end, negative offset, limit zero, and missing stored record in renderer", async () => {
  const store = new HugeResultStore();
  store.remember("read-result-body", "1", "read");
  let lookupTool;
  registerLookupTool({ registerTool: (tool) => { lookupTool = tool; } }, store);

  const pastEnd = await lookupTool.execute("lookup-1", { ref: "dsc-read-1", offset: 999, limit: 10 });
  assert.equal(pastEnd.content[0].text, "[context_result_lookup kind=slice ref=dsc-read-1 offset=999 limit=10 range=999:999 returned_chars=0 total_chars=16 bytes=16 has_more=false]\n");

  const negativeOffset = await lookupTool.execute("lookup-2", { ref: "dsc-read-1", offset: -5, limit: 4 });
  assert.equal(negativeOffset.details.offset, 0);
  assert.equal(negativeOffset.content[0].text, "[context_result_lookup kind=slice ref=dsc-read-1 offset=0 limit=4 range=0:4 returned_chars=4 total_chars=16 bytes=16 has_more=true next_offset=4]\nread");

  const limitZero = await lookupTool.execute("lookup-3", { ref: "dsc-read-1", offset: 4, limit: 0 });
  assert.equal(limitZero.content[0].text, "[context_result_lookup kind=slice ref=dsc-read-1 offset=4 limit=0 range=4:4 returned_chars=0 total_chars=16 bytes=16 has_more=true next_offset=4]\n");

  const theme = { fg: (_name, value) => value, bold: (value) => value };
  assert.match(lookupTool.renderCall({}, theme).text, /context_result_lookup \? · chars from 0/);
  assert.equal(lookupTool.renderResult({ content: null, details: {} }, { expanded: false }, theme).text, "");

  const previewOnly = {
    content: [{ type: "text", text: `${MODEL_VISIBLE_CONTEXT_MARKER}\n<model_visible_context schema="${MODEL_VISIBLE_CONTEXT_SCHEMA}" kind="context_result_truncated" ui="custom-rendered">\n<metadata>\n{"kind":"context_result_truncated","ref":"dsc-missing","source_tool":"bash"}\n</metadata>\n<payload name="preview">\npreview only\n</payload>\n</model_visible_context>` }],
    details: { elidedBy: "pi-context-engine", ref: "dsc-missing", bytes: 10 },
  };
  const rendered = renderStoredHugeResult(previewOnly, false, theme, store).text;
  assert.match(rendered, /preview only/);
  assert.match(rendered, /source bash/);
});

// Token counting edge cases (from semantic-fold.ts)
test("token counting: empty string content", async () => {
	const { countMessageTokens } = await import("../src/projection/history-folder.ts");
	assert.equal(countMessageTokens({ role: "user", content: "" }), 1); // 4 role chars / 4 = 1
});

test("token counting: very long content", async () => {
	const { countMessageTokens } = await import("../src/projection/history-folder.ts");
	const long = "x".repeat(10000);
	const tokens = countMessageTokens({ role: "user", content: long });
	assert.equal(tokens, Math.ceil((10000 + 4) / 4));
});

test("token counting: ContentPart with empty parts", async () => {
	const { countMessageTokens } = await import("../src/projection/history-folder.ts");
	const tokens = countMessageTokens({
		role: "user",
		content: [{ type: "text", text: "" }, { type: "text", text: "hi" }],
	});
	assert.equal(tokens, Math.ceil((2 + 4) / 4)); // 6 chars / 4 = 1.5 → 2
});

test("token counting: tool_calls with empty args", async () => {
	const { countMessageTokens } = await import("../src/projection/history-folder.ts");
	const tokens = countMessageTokens({
		role: "assistant",
		content: "do",
		tool_calls: [{ function: { name: "f", arguments: "" } }],
	});
	// content 2 + 4 overhead + func name 1 = 7 chars / 4 = 1.75 → 2
	assert.equal(tokens, 2);
});

test("token counting: whitespace-only and multimodal content ignore non-text parts", async () => {
	const { countMessageTokens } = await import("../src/projection/history-folder.ts");
	assert.equal(countMessageTokens({ role: "user", content: "    " }), 2);
	assert.equal(countMessageTokens({
		role: "user",
		content: [
			{ type: "image_url", image_url: { url: "data:image/png;base64,xxx" } },
			{ type: "text", text: "hello" },
			{ type: "input_audio", data: "ignored" },
		],
	}), Math.ceil((5 + 4) / 4));
});

// ── Cache Checkpoint Tests ──

test("openCacheCheckpoint creates checkpoint and segment boundary", () => {
	const state = createRuntimeState();
	const count = state.engine.checkpoints.length;
	assert.ok(count >= 1);
	assert.equal(state.engine.checkpoints[0].reason, "session_start");
	assert.ok(state.engine.segments.length >= 1);

	openCacheCheckpoint(state, "provider_model_drift", { modelId: "deepseek-pro", startSegment: true });
	assert.equal(state.engine.checkpoints.length, count + 1);
	assert.equal(state.engine.checkpoints[count].reason, "provider_model_drift");
	assert.equal(state.engine.segments.length, count + 1);
});

test("context_checkpoint does not start segment by default", () => {
	const state = createRuntimeState();
	const segCount = state.engine.segments.length;

	openCacheCheckpoint(state, "agent_checkpoint", { conversationLabel: "before-refactor", startSegment: false });
	assert.equal(state.engine.segments.length, segCount);
	assert.equal(state.engine.checkpoints[state.engine.checkpoints.length - 1].conversationLabel, "before-refactor");
});

test("rewind creates checkpoint and starts new segment", () => {
	const state = createRuntimeState();
	const segCount = state.engine.segments.length;

	openCacheCheckpoint(state, "rewind", { conversationEntryId: "abc123", conversationBranchId: "def456", startSegment: true });
	assert.equal(state.engine.segments.length, segCount + 1);
	assert.equal(state.engine.checkpoints[state.engine.checkpoints.length - 1].reason, "rewind");
});

test("model drift creates hard segment boundary", () => {
	const state = createRuntimeState();
	state.engine.lastProviderModelId = "deepseek-flash";
	const segCount = state.engine.segments.length;

	openCacheCheckpoint(state, "provider_model_drift", { previousModelId: "deepseek-flash", modelId: "deepseek-pro", startSegment: true });
	assert.equal(state.engine.segments.length, segCount + 1);
});

test("first usage after checkpoint is warmup", () => {
	const state = createRuntimeState();
	const snap = { input: 100, cacheRead: 50, cacheWrite: 0, output: 20, createdAt: Date.now() };
	const annotated = annotateUsageForCurrentSegment(state, snap);
	assert.equal(annotated.warmup, true);
	assert.ok(annotated.segmentId);
	assert.ok(annotated.checkpointId);

	const snap2 = { input: 100, cacheRead: 90, cacheWrite: 0, output: 20, createdAt: Date.now() };
	const annotated2 = annotateUsageForCurrentSegment(state, snap2);
	assert.equal(annotated2.warmup, false);
});

test("warmHitRate excludes warmup requests", () => {
	const usages = [
		{ input: 10, cacheRead: 0, cacheWrite: 0, output: 10, createdAt: Date.now(), warmup: true },
		{ input: 5, cacheRead: 95, cacheWrite: 0, output: 10, createdAt: Date.now(), warmup: false },
		{ input: 5, cacheRead: 95, cacheWrite: 0, output: 10, createdAt: Date.now(), warmup: false },
	];
	const rate = warmHitRate(usages);
	assert.ok(rate !== undefined, "warm hit rate should be defined");
	assert.ok(rate > 0.9, "warm hit rate should be >90% after warmup, got " + rate);

});

test("aggregateByModel sums tokens and costs correctly", () => {
	const usages = [
		{ modelId: "deepseek-v4-flash", provider: "deepseek", input: 1000, cacheRead: 9000, cacheWrite: 0, output: 500, actualCost: 0.01, noCacheCost: 0.05, savings: 0.04, createdAt: Date.now(), warmup: false, modelCost: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
		{ modelId: "deepseek-v4-flash", provider: "deepseek", input: 500, cacheRead: 4500, cacheWrite: 0, output: 200, actualCost: 0.005, noCacheCost: 0.025, savings: 0.02, createdAt: Date.now(), warmup: false, modelCost: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
		{ modelId: "deepseek-v4-pro", provider: "deepseek", input: 200, cacheRead: 0, cacheWrite: 0, output: 100, actualCost: 0.001, createdAt: Date.now(), warmup: true, modelCost: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
	];
	const summaries = aggregateByModel(usages);
	assert.equal(summaries.length, 2);

	const flash = summaries.find((s) => s.modelId === "deepseek-v4-flash");
	assert.ok(flash);
	assert.equal(flash.requests, 2);
	assert.equal(flash.input, 1500);
	assert.equal(flash.cacheRead, 13500);
	assert.equal(flash.actualCost, 0.015);

	const pro = summaries.find((s) => s.modelId === "deepseek-v4-pro");
	assert.ok(pro);
	assert.equal(pro.requests, 1);
	assert.equal(pro.input, 200);
});

test("mixed pricing does not fabricate savings", () => {
	const usages = [
		{ modelId: "unknown-model", input: 100, cacheRead: 0, cacheWrite: 0, output: 10, actualCost: undefined, noCacheCost: undefined, savings: undefined, createdAt: Date.now() },
	];
	const summaries = aggregateByModel(usages);
	assert.equal(summaries.length, 1);
	assert.equal(summaries[0].pricingKnown, false);
	assert.equal(summaries[0].noCacheCost, undefined);
	assert.equal(summaries[0].savings, undefined);
});

test("aggregateBySegment groups usages by segment", () => {
	const usages = [
		{ segmentId: "segment-1", checkpointId: "cp-1", checkpointReason: "session_start", modelId: "m1", input: 100, cacheRead: 900, cacheWrite: 0, output: 50, actualCost: 0.005, createdAt: Date.now() },
		{ segmentId: "segment-1", input: 100, cacheRead: 900, cacheWrite: 0, output: 50, actualCost: 0.005, createdAt: Date.now() },
		{ segmentId: "segment-2", checkpointReason: "model_select", modelId: "m2", input: 50, cacheRead: 0, cacheWrite: 0, output: 30, actualCost: 0.003, warmup: true, createdAt: Date.now() },
	];
	const summaries = aggregateBySegment(usages);
	assert.equal(summaries.length, 2);
	
	const s1 = summaries.find((s) => s.segmentId === "segment-1");
	assert.ok(s1);
	assert.equal(s1.requests, 2);
	assert.equal(s1.actualCost, 0.01);

	const s2 = summaries.find((s) => s.segmentId === "segment-2");
	assert.ok(s2);
	assert.equal(s2.warmupRequests, 1);
});

test("currentSegmentStats returns filtered stats", () => {
	const state = createRuntimeState();
	const seg = currentCacheSegment(state);
	seg.warmupRequests = 0;
	const stats = currentSegmentStats(state);
	assert.ok(stats !== undefined);
	assert.equal(stats.requests, 0);
});

import test from "node:test";
import assert from "node:assert/strict";

import { detectDeepSeekModel } from "../src/model.ts";
import { emptyStats, addUsage, cacheSavingsUsd, computeHitRatio, costToCompact, deepSeekOfficialCost, extractUsageSnapshot, hitRatio, savingsFromRealCost, aggregateByModel, aggregateBySegment, currentSegmentStats, warmHitRate } from "../src/stats.ts";
import { inspectProviderPayload } from "../src/payload-diagnostics.ts";
import { parseConfig, DEFAULT_CONFIG } from "../src/config.ts";
import { createRuntimeState } from "../src/runtime-state.ts";
import { syncModelSelection } from "../src/index.ts";
import { classifyPruner, detectPruner } from "../src/pruner-advisor.ts";
import { getContextPercent, recommendContextAction } from "../src/context-monitor.ts";
import { CUSTOM_TYPE_HUGE_RESULT, HugeResultStore, buildPreview, maybeCapToolResult, persistHugeResult, registerLookupTool, renderStoredHugeResult, restoreHugeResultsFromSession } from "../src/capper.ts";
import { MODEL_VISIBLE_CONTEXT_MARKER, MODEL_VISIBLE_CONTEXT_SCHEMA } from "../src/model-visible.ts";
import { estimateTokens, maybeAdjustCutForCache, simpleHash } from "../src/cache-engine/custom-compaction.ts";
import { openCacheCheckpoint, currentCacheSegment, annotateUsageForCurrentSegment } from "../src/cache-engine/cache-checkpoints.ts";
import { canCompactNow, decideCompaction, detectTextualToolCall, diffPrefix, extractCachePrefix, handleProviderPrefix, handleToolCall, normalizeTools, registerParallelReadTool, shouldNotifyPrefixDrift, stableHash } from "../src/cache-engine/index.ts";
import { CUSTOM_TYPE_TELEMETRY, restoreTelemetryFromSession } from "../src/telemetry-persistence.ts";
import { pruneMessages } from "../src/projection/pruner.ts";

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
  assert.match(pruned[0].content, /batch summary/);
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
  assert.deepEqual(registered, ["deepseek_cache_parallel_read"]);
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
  assert.equal(detectTextualToolCall({ content: "function call: read({ path: 'a.ts' })" }), true);
  assert.equal(detectTextualToolCall({ content: "normal answer" }), false);
  assert.equal(detectTextualToolCall({ content: "This answer explains what a function call is." }), false);
  assert.equal(detectTextualToolCall({ content: "If the tool schema has offset and limit, I can call it like:\n```json\n{\"name\":\"context_result_lookup\",\"parameters\":{\"ref\":\"dsc-1\",\"offset\":0,\"limit\":100}}\n```" }), false);
  assert.equal(detectTextualToolCall({ content: "Да, смогу вызывать context_result_lookup({ ref: \"dsc-1\", offset: 0, limit: 100 }) как пример." }), false);
  assert.equal(detectTextualToolCall({ content: "tool_call", toolCalls: [{ name: "read" }] }), false);
});

test("huge result capper elides only above threshold and preserves recovery details", async () => {
  const store = new HugeResultStore();
  const disabled = { ...DEFAULT_CONFIG, hugeResultCapper: false, hugeResultChars: 10, hugeResultHeadChars: 4, hugeResultTailChars: 4 };
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "abcdefghijklmnop" }], toolCallId: "1", toolName: "bash" }, disabled, store), undefined);

  const config = { ...disabled, hugeResultCapper: true };
  const result = maybeCapToolResult({ content: [{ type: "text", text: "abcdefghijklmnop" }], toolCallId: "1", toolName: "bash" }, config, store);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, new RegExp(MODEL_VISIBLE_CONTEXT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.content[0].text, new RegExp(`<model_visible_context schema="${MODEL_VISIBLE_CONTEXT_SCHEMA}" kind="context_result_truncated" ui="custom-rendered">`));
  assert.match(result.content[0].text, /<metadata>/);
  assert.match(result.content[0].text, /"recovery":/);
  assert.match(result.content[0].text, /"tool": "context_result_lookup"/);
  assert.match(result.content[0].text, /"arguments":/);
  assert.match(result.content[0].text, /dsc-bash-1/);
  assert.match(result.content[0].text, /\[context_result_lookup kind=slice ref=dsc-bash-1 offset=0 limit=16 range=0:16 returned_chars=16 total_chars=16 bytes=16 has_more=false\]/);
  assert.deepEqual(result.details, { elidedBy: "pi-context-engine", ref: "dsc-bash-1", bytes: 16 });
  const record = store.get("dsc-bash-1");
  assert.equal(record.toolCallId, "1");
  assert.equal(record.toolName, "bash");
  const preview = buildPreview(record, config);
  assert.match(preview, /abcd/);
  assert.match(preview, /mnop/);

  let lookupTool;
  registerLookupTool({ registerTool: (tool) => { lookupTool = tool; } }, store);
  const lookup = await lookupTool.execute("lookup-1", { ref: "dsc-bash-1" });
  assert.equal(lookup.details.found, true);
  assert.equal(lookup.content[0].text, "[context_result_lookup kind=full ref=dsc-bash-1 offset=0 range=0:16 returned_chars=16 total_chars=16 bytes=16 has_more=false]\nabcdefghijklmnop");
  const partialLookup = await lookupTool.execute("lookup-1", { ref: "dsc-bash-1", offset: 4, limit: 6 });
  assert.equal(partialLookup.content[0].text, "[context_result_lookup kind=slice ref=dsc-bash-1 offset=4 limit=6 range=4:10 returned_chars=6 total_chars=16 bytes=16 has_more=true next_offset=10]\nefghij");
  assert.equal(partialLookup.details.offset, 4);
  assert.equal(partialLookup.details.limit, 6);
  const theme = { fg: (_name, value) => value, bold: (value) => value };
  const collapsedLookup = lookupTool.renderResult(partialLookup, { expanded: false }, theme).text;
  assert.match(collapsedLookup, /dsc-bash-1 · chars 4-10 \/ 16 chars · limit 6/);
  assert.match(collapsedLookup, /efghij/);
  assert.doesNotMatch(collapsedLookup, /\[context_result_lookup kind=slice/);
  const expandedLookup = lookupTool.renderResult(partialLookup, { expanded: true }, theme).text;
  assert.equal(expandedLookup, "efghij");
  assert.doesNotMatch(expandedLookup, /\[context_result_lookup kind=slice/);
  assert.equal(maybeCapToolResult({ ...lookup, toolCallId: "lookup-1", toolName: "context_result_lookup" }, config, store), undefined);
  const missing = await lookupTool.execute("lookup-2", { ref: "missing" });
  assert.equal(missing.details.found, false);
});

test("huge result capper never inlines full configured head and tail beyond hard preview budget", () => {
  const store = new HugeResultStore();
  const result = maybeCapToolResult(
    { content: [{ type: "text", text: "x".repeat(70_000) }], toolCallId: "1", toolName: "bash" },
    { ...DEFAULT_CONFIG, hugeResultHeadChars: 6_000, hugeResultTailChars: 6_000 },
    store,
  );
  assert.ok(result);
  assert.ok(result.content[0].text.length < 3_000);
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

test("huge result capper recognizes lookup result shapes without toolName", () => {
  const store = new HugeResultStore();
  const config = { ...DEFAULT_CONFIG, hugeResultCapper: true, hugeResultChars: 100 };
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "x".repeat(1000) }], details: { ref: "dsc-1", found: true } }, config, store), undefined);
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "x".repeat(1000) }], result: { details: { ref: "dsc-1", found: true } } }, config, store), undefined);
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

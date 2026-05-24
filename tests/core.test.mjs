import test from "node:test";
import assert from "node:assert/strict";

import { detectDeepSeekModel } from "../src/model.ts";
import { emptyStats, addUsage, cacheSavingsUsd, computeHitRatio, costToCompact, deepSeekOfficialCost, extractUsageSnapshot, hitRatio, savingsFromRealCost } from "../src/stats.ts";
import { inspectProviderPayload } from "../src/payload-diagnostics.ts";
import { parseConfig, DEFAULT_CONFIG } from "../src/config.ts";
import { createRuntimeState } from "../src/runtime-state.ts";
import { classifyPruner, detectPruner } from "../src/pruner-advisor.ts";
import { getContextPercent, recommendContextAction } from "../src/context-monitor.ts";
import { HugeResultStore, buildPreview, maybeCapToolResult, registerLookupTool } from "../src/capper.ts";
import { estimateTokens, maybeAdjustCutForCache, simpleHash } from "../src/cache-engine/custom-compaction.ts";
import { canCompactNow, decideCompaction, detectTextualToolCall, diffPrefix, extractCachePrefix, handleProviderPrefix, handleToolCall, normalizeTools, registerParallelReadTool, shouldNotifyPrefixDrift, stableHash } from "../src/cache-engine/index.ts";

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
  assert.deepEqual(deepSeekOfficialCost("deepseek-v4-flash"), { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 });
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
  assert.deepEqual(diffPrefix(prev, { ...prev, temperature: 0.7 }), { hard: false, reasons: ["temperature"] });
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
  assert.match(invalidRead.reason, /Invalid tool arguments/);

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
  assert.equal(detectTextualToolCall({ content: "tool_call", toolCalls: [{ name: "read" }] }), false);
});

test("huge result capper elides only above threshold and preserves recovery details", async () => {
  const store = new HugeResultStore();
  const disabled = { ...DEFAULT_CONFIG, hugeResultCapper: false, hugeResultChars: 10, hugeResultHeadChars: 4, hugeResultTailChars: 4 };
  assert.equal(maybeCapToolResult({ content: [{ type: "text", text: "abcdefghijklmnop" }], toolCallId: "1", toolName: "bash" }, disabled, store), undefined);

  const config = { ...disabled, hugeResultCapper: true };
  const result = maybeCapToolResult({ content: [{ type: "text", text: "abcdefghijklmnop" }], toolCallId: "1", toolName: "bash" }, config, store);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /deepseek-cache/);
  assert.match(result.content[0].text, /dsc-1/);
  assert.deepEqual(result.details, { elidedBy: "pi-deepseek-cache", ref: "dsc-1", bytes: 16 });
  const record = store.get("dsc-1");
  assert.equal(record.toolCallId, "1");
  assert.equal(record.toolName, "bash");
  const preview = buildPreview(record, config);
  assert.match(preview, /abcd/);
  assert.match(preview, /mnop/);

  let lookupTool;
  registerLookupTool({ registerTool: (tool) => { lookupTool = tool; } }, store);
  const lookup = await lookupTool.execute("lookup-1", { ref: "dsc-1" });
  assert.equal(lookup.details.found, true);
  assert.equal(lookup.content[0].text, "abcdefghijklmnop");
  const missing = await lookupTool.execute("lookup-2", { ref: "missing" });
  assert.equal(missing.details.found, false);
});

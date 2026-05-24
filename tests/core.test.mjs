import test from "node:test";
import assert from "node:assert/strict";

import { detectDeepSeekModel } from "../src/deepseek-detector.ts";
import { emptyStats, addUsage, extractUsageSnapshot, hitRatio } from "../src/telemetry.ts";
import { inspectProviderPayload } from "../src/payload-diagnostics.ts";
import { parseConfig, DEFAULT_CONFIG } from "../src/config.ts";
import { detectPruner } from "../src/pruner-advisor.ts";
import { getContextPercent, recommendContextAction } from "../src/context-monitor.ts";
import { HugeResultStore, buildPreview, maybeCapToolResult } from "../src/capper.ts";

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

test("detects pi-context-prune commands/tools", () => {
  const status = detectPruner({
    getCommands: () => [{ name: "pruner", source: "extension" }],
    getAllTools: () => [{ name: "context_tree_query" }],
  });
  assert.equal(status.installed, true);
  assert.equal(status.lookupTool, true);
  assert.equal(status.recommendations.some((line) => line.includes("agent-message")), true);
});

test("context percent and recommendations", () => {
  assert.equal(getContextPercent({ usedTokens: 60, contextWindow: 100 }), 0.6);
  const rec = recommendContextAction(0.73, DEFAULT_CONFIG);
  assert.equal(rec.level, "danger");
});

test("huge result capper elides only above threshold", () => {
  const store = new HugeResultStore();
  const config = { ...DEFAULT_CONFIG, hugeResultCapper: true, hugeResultChars: 10, hugeResultHeadChars: 4, hugeResultTailChars: 4 };
  const result = maybeCapToolResult({ content: [{ type: "text", text: "abcdefghijklmnop" }], toolCallId: "1", toolName: "bash" }, config, store);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /deepseek-cache/);
  assert.match(result.content[0].text, /dsc-1/);
  const preview = buildPreview(store.get("dsc-1"), config);
  assert.match(preview, /abcd/);
  assert.match(preview, /mnop/);
});

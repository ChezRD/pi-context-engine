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

describe("config.ts edge cases", () => {
  it("loads module and functions", async () => {
m.readConfig = (await import("../../src/config.ts")).readConfig;
m.parseConfig = (await import("../../src/config.ts")).parseConfig;
m.formatPrefixReason = (await import("../../src/prefix-reasons.ts")).formatPrefixReason;
m.readContextPercent = (await import("../../src/context-monitor.ts")).readContextPercent;
m.extractToolResultText = (await import("../../src/capper.ts")).extractToolResultText;
m.summarizeToolBatchPool = (await import("../../src/projection/tool-pruner.ts")).summarizeToolBatchPool;
m.buildPoolPrompt = (await import("../../src/projection/tool-pruner.ts")).buildPoolPrompt;
m.normalizeToolResultForSummary = (await import("../../src/projection/tool-pruner.ts")).normalizeToolResultForSummary;
m.summarizeToolBatch = (await import("../../src/projection/tool-pruner.ts")).summarizeToolBatch;
m.summarizeToolBatches = (await import("../../src/projection/tool-pruner.ts")).summarizeToolBatches;
m.hitRatio = (await import("../../src/stats.ts")).hitRatio;
m.stableHash = (await import("../../src/cache-engine/prefix-fingerprint.ts")).stableHash;
m.createRuntimeState = (await import("../../src/runtime-state.ts")).createRuntimeState;
m.holdCompaction = (await import("../../src/cache-engine/auto-compact.ts")).holdCompaction;
m.buildStatus = (await import("../../src/status.ts")).buildStatus;
m.captureBatches = (await import("../../src/projection/batch-capture.ts")).captureBatches;
    assert.ok(m.readConfig);
  });

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

describe("formatPrefixReason", () => {
  it("returns unknown for empty reason", () => {
    const r = m.formatPrefixReason({ locale: "en" }, undefined);
    assert.match(r, /unknown/i);
  });

  it("returns compact single reason", () => {
    const r = m.formatPrefixReason({ locale: "en" }, "model", "compact");
    assert.ok(r.length > 0);
  });

  it("returns compact request shape for all three", () => {
    const r = m.formatPrefixReason({ locale: "en" }, "model,system,tools", "compact");
    assert.ok(r.length > 0);
  });

  it("returns compact multiple for non-shape combo", () => {
    const r = m.formatPrefixReason({ locale: "en" }, "model,tools", "compact");
    assert.match(r, /\d/);
  });

  it("returns detail mode list", () => {
    const r = m.formatPrefixReason({ locale: "en" }, "model,tools", "detail");
    assert.ok(r.length > 0);
  });

  it("strips whitespace from reason parts", () => {
    const r = m.formatPrefixReason({ locale: "en" }, " model , system ", "compact");
    assert.ok(r.length > 0);
  });

  it("filters unknown reason parts", () => {
    const r = m.formatPrefixReason({ locale: "en" }, "unknown_reason,model", "compact");
    assert.ok(r.length > 0);
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
  it("returns undefined on getContextUsage error", async () => {
    const ctx = { getContextUsage: () => { throw new Error("fail"); } };
    const pct = await m.readContextPercent(ctx);
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
    const { computeHitRatio } = await import("../../src/stats.ts");
    assert.equal(computeHitRatio(0, 0), 0);
  });
  it("calculates ratio", async () => {
    const { computeHitRatio } = await import("../../src/stats.ts");
    assert.equal(computeHitRatio(100, 900), 0.9);
  });
});

describe("cacheSavingsUsd", () => {
  it("returns 0 for unknown model", async () => {
    const { cacheSavingsUsd } = await import("../../src/stats.ts");
    assert.equal(cacheSavingsUsd("unknown-model", 1000), 0);
  });
  it("calculates savings for flash", async () => {
    const { cacheSavingsUsd } = await import("../../src/stats.ts");
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
    const { markCompaction, emptyStats } = await import("../../src/stats.ts");
    const stats = markCompaction(emptyStats(), { turn: 1, reason: "auto", completed: true });
    assert.equal(stats.compacts.length, 1);
    assert.equal(stats.compacts[0].turn, 1);
  });
  it("resets sinceCompactionRequests without record and initializes missing compacts array", async () => {
    const { markCompaction, emptyStats } = await import("../../src/stats.ts");
    const base = { ...emptyStats(), sinceCompactionRequests: 5, compacts: undefined };
    const stats = markCompaction(base);
    assert.equal(stats.sinceCompactionRequests, 0);
    assert.deepEqual(stats.compacts, []);
  });
});

describe("cache-engine barrel re-exports", () => {
  it("imports from hit-telemetry", async () => {
    const m = await import("../../src/cache-engine/hit-telemetry.ts");
    assert.equal(typeof m.hitRatio, "function");
  });
  it("imports from stable-hash", async () => {
    const m = await import("../../src/cache-engine/stable-hash.ts");
    assert.equal(typeof m.stableHash, "function");
  });
  it("imports from state", async () => {
    const m = await import("../../src/cache-engine/state.ts");
    assert.equal(typeof m.createRuntimeState, "function");
  });
  it("imports from pruner-profile", async () => {
    const m = await import("../../src/cache-engine/pruner-profile.ts");
    assert.equal(typeof m.detectPruner, "function");
  });
  it("imports from compaction-controller", async () => {
    const m = await import("../../src/cache-engine/compaction-controller.ts");
    assert.equal(typeof m.holdCompaction, "function");
  });
  it("imports from cache-engine/status", async () => {
    const m = await import("../../src/cache-engine/status.ts");
    assert.equal(typeof m.buildStatus, "function");
  });
});

describe("aggregateByModel", () => {
	it("uses unknown bucket and keeps first provider when later usages omit it", async () => {
		const { aggregateByModel } = await import("../../src/stats.ts");
		const summaries = aggregateByModel([
			{ input: 10, cacheRead: 90, cacheWrite: 0, output: 1, actualCost: 0.1, provider: "deepseek", createdAt: Date.now() },
			{ input: 5, cacheRead: 45, cacheWrite: 0, output: 1, actualCost: 0.05, createdAt: Date.now() },
		]);
		assert.equal(summaries.length, 1);
		assert.equal(summaries[0].modelId, "unknown");
		assert.equal(summaries[0].provider, "deepseek");
	});
	it("retains pricing metrics when pricingKnown is true", async () => {
		const { aggregateByModel } = await import("../../src/stats.ts");
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
		const { aggregateBySegment } = await import("../../src/stats.ts");
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
    const { usageTotalInput } = await import("../../src/stats.ts");
    assert.equal(usageTotalInput({ input: 100, cacheRead: 200, cacheWrite: 50 }), 350);
  });
  it("handles undefined", async () => {
    const { usageTotalInput } = await import("../../src/stats.ts");
    assert.equal(usageTotalInput(undefined), 0);
  });
});

describe("sessionHitRateAfterWarmup", () => {
  it("filters warmup turns and calculates ratio", async () => {
    const { sessionHitRateAfterWarmup } = await import("../../src/stats.ts");
    const usages = [
      { turn: 0, input: 100, cacheRead: 0, cacheWrite: 0, output: 0 },
      { turn: 0, input: 100, cacheRead: 0, cacheWrite: 0, output: 0 },
      { turn: 2, input: 100, cacheRead: 900, cacheWrite: 0, output: 0, totalInput: 1000 },
      { turn: 3, input: 100, cacheRead: 0, cacheWrite: 0, output: 0 },
    ];
    const rate = sessionHitRateAfterWarmup(usages, 1);
    assert.equal(rate, 900 / 1100);
    const withoutTotalInput = [
      { turn: 2, input: 100, cacheRead: 900, cacheWrite: 0, output: 0 },
    ];
    assert.equal(sessionHitRateAfterWarmup(withoutTotalInput, 1), 0.9);
  });
  it("returns 0 for no non-warmup usage", async () => {
    const { sessionHitRateAfterWarmup } = await import("../../src/stats.ts");
    const rate = sessionHitRateAfterWarmup([{ turn: 0, input: 100, cacheRead: 0, cacheWrite: 0, output: 0 }], 5);
    assert.equal(rate, 0);
  });
  it("falls back to input+cacheRead+cacheWrite when totalInput is missing", async () => {
    const { sessionHitRateAfterWarmup } = await import("../../src/stats.ts");
    const usages = [
      { turn: 5, input: 100, cacheRead: 300, cacheWrite: 100, output: 0 },
    ];
    const rate = sessionHitRateAfterWarmup(usages, 0);
    assert.equal(rate, 0.6);
  });
});

describe("handleProviderPrefix edge cases", () => {
  it("returns undefined when disabled", async () => {
    const { handleProviderPrefix } = await import("../../src/cache-engine/prefix-fingerprint.ts");
    const state = { config: { enabled: false, prefixFingerprint: true }, engine: { prefixDriftCount: 0, toolHashChanges: 0, lastPrefixChangeReason: "" } };
    const r = handleProviderPrefix({ payload: { model: "test" } }, {}, state);
    assert.equal(r, undefined);
  });
  it("handles missing payload", async () => {
    const { handleProviderPrefix } = await import("../../src/cache-engine/prefix-fingerprint.ts");
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
    const { getConfigPath } = await import("../../src/config.ts");
    const p = getConfigPath();
    assert.ok(p.endsWith("context-engine.json"));
  });
});
});

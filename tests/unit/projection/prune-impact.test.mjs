import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("prune-impact", () => {
  let mod, stats, state;

  before(async () => {
    mod = await import("../../../src/projection/prune-impact.ts");
    stats = await import("../../../src/stats.ts");
    const { createRuntimeState } = await import("../../../src/runtime-state.ts");
    state = createRuntimeState();
    state.engine.prune.impact = {
      summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0,
      summarizeCost: 0, summarizeToolCalls: 0, summarizeRawChars: 0, summarizeSummaryChars: 0,
      summarizeCacheReadTokens: 0, summarizeByModel: [],
      postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0, postPruneMissCost: 0,
      postPruneLookupRegret: 0, postPruneReadRegret: 0, postFoldReadRegret: 0,
      pendingBatchesPreservedDuringFlush: 0, pendingToolCallsPreservedDuringFlush: 0,
      lastPendingBatchesPreservedDuringFlush: 0, lastPendingToolCallsPreservedDuringFlush: 0,
      noOpToolCalls: 0, lastNoOpToolCalls: 0,
    };
    state.stats.savings = 1000;
  });

  it("loads module exports", () => {
    assert.equal(typeof mod.recordPruneSummarizeImpact, "function");
    assert.equal(typeof mod.markAwaitingPruneImpact, "function");
    assert.equal(typeof mod.recordPostPruneImpact, "function");
    assert.equal(typeof mod.pruneNegativeImpactCost, "function");
    assert.equal(typeof mod.pruneAdjustedSavings, "function");
  });

  it("recordPruneSummarizeImpact updates counters", () => {
    mod.recordPruneSummarizeImpact(state, {
      requests: 5, inputTokens: 100, outputTokens: 20, cacheReadTokens: 10,
      cost: 0.05, toolCalls: 8, rawChars: 5000, summaryChars: 200,
      modelId: "deepseek/deepseek-chat",
    });
    const imp = state.engine.prune.impact;
    assert.equal(imp.summarizeRequests, 5);
    assert.equal(imp.summarizeInputTokens, 100);
    assert.equal(imp.summarizeOutputTokens, 20);
    assert.equal(imp.summarizeCacheReadTokens, 10);
    assert.equal(imp.summarizeCost, 0.05);
    assert.equal(imp.summarizeToolCalls, 8);
    assert.equal(imp.summarizeRawChars, 5000);
    assert.equal(imp.summarizeSummaryChars, 200);
  });

  it("recordPruneSummarizeImpact initializes missing impact state", () => {
    const missing = {
      engine: {
        prune: {
          impact: undefined,
        },
      },
      stats: { savings: 0 },
    };

    mod.recordPruneSummarizeImpact(missing, {
      requests: 1, inputTokens: 2, outputTokens: 3, cacheReadTokens: 4,
      cost: 0.01, toolCalls: 5, rawChars: 6, summaryChars: 7,
    });

    assert.equal(missing.engine.prune.impact.summarizeRequests, 1);
    assert.equal(missing.engine.prune.impact.postPruneLookupRegret, 0);
    assert.equal(missing.engine.prune.impact.lastRebuildSavedApproxChars, 0);
  });

  it("recordPruneSummarizeImpact groups by model", () => {
    assert.equal(state.engine.prune.impact.summarizeByModel.length, 1);
    assert.equal(state.engine.prune.impact.summarizeByModel[0].modelId, "deepseek-chat");
    assert.equal(state.engine.prune.impact.summarizeByModel[0].requests, 5);
  });

  it("recordPruneSummarizeImpact handles no-slash model ids and existing buckets", () => {
    state.engine.prune.impact.summarizeByModel = [];
    mod.recordPruneSummarizeImpact(state, {
      requests: 1, inputTokens: 2, outputTokens: 3, cost: 0.01, toolCalls: 4,
      modelId: "local-model",
    });
    mod.recordPruneSummarizeImpact(state, {
      requests: 2, inputTokens: 3, outputTokens: 4, cacheReadTokens: 5, cost: 0.02, toolCalls: 6,
      modelId: "local-model",
    });
    assert.equal(state.engine.prune.impact.summarizeByModel.length, 1);
    assert.equal(state.engine.prune.impact.summarizeByModel[0].provider, undefined);
    assert.equal(state.engine.prune.impact.summarizeByModel[0].requests, 3);
    assert.equal(state.engine.prune.impact.summarizeByModel[0].cacheReadTokens, 5);
  });

  it("recordPruneSummarizeImpact with errorKey stores it", () => {
    mod.recordPruneSummarizeImpact(state, {
      requests: 1, inputTokens: 10, outputTokens: 2, cost: 0.01, toolCalls: 1,
      rawChars: 500, summaryChars: 50, errorKey: "timeout",
    });
    assert.equal(state.engine.prune.impact.lastErrorKey, "timeout");
  });

  it("recordPruneSummarizeImpact clears previous error after successful request", () => {
    state.engine.prune.impact.lastErrorKey = "timeout";

    mod.recordPruneSummarizeImpact(state, {
      requests: 1, inputTokens: 1, outputTokens: 1, cost: 0, toolCalls: 1,
    });

    assert.equal(state.engine.prune.impact.lastErrorKey, undefined);
  });

  it("recordPruneSummarizeImpact with errorKey and 0 requests clears prompt/response", () => {
    mod.recordPruneSummarizeImpact(state, {
      requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: 0,
      rawChars: 0, summaryChars: 0, errorKey: "fail",
    });
    assert.equal(state.engine.prune.impact.lastSummarizePrompt, undefined);
    assert.equal(state.engine.prune.impact.lastSummarizeResponse, undefined);
  });

  it("markAwaitingPruneImpact sets awaitingImpact", () => {
    mod.markAwaitingPruneImpact(state, ["tc-1"]);
    assert.deepEqual(state.engine.prune.awaitingImpact, { turn: state.engine.turnIndex, appliedIds: ["tc-1"] });
  });

  it("recordPostPruneImpact no-ops without awaitingImpact", () => {
    delete state.engine.prune.awaitingImpact;
    mod.recordPostPruneImpact(state, undefined);
    assert.equal(state.engine.prune.impact.postPruneRequests, 0);
  });

  it("recordPostPruneImpact updates when awaiting with usage", () => {
    mod.markAwaitingPruneImpact(state, ["tc-2"]);
    const usage = {
      input: 500, cacheWrite: 100, cacheRead: 50, output: 30, hitRate: 0.85,
      modelId: "deepseek-chat",
      modelCost: { input: 2e-7, output: 2e-7, cacheRead: 1e-7, cacheWrite: 2e-7 },
    };
    mod.recordPostPruneImpact(state, usage);
    assert.equal(state.engine.prune.impact.postPruneRequests, 1);
    assert.equal(state.engine.prune.impact.postPruneMissTokens, 600);
    assert.equal(state.engine.prune.impact.postPruneCacheReadTokens, 50);
    assert.equal(state.engine.prune.awaitingImpact, undefined);
  });

  it("recordPostPruneImpact uses fallback model cost when usage has no pricing", () => {
    mod.markAwaitingPruneImpact(state, ["tc-3"]);
    mod.recordPostPruneImpact(state, {
      input: 10, cacheWrite: 5, cacheRead: 2, output: 0, hitRate: 0.5,
      modelId: "unknown-model",
    }, { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 });
    assert.equal(state.engine.prune.impact.lastPostPruneMissTokens, 15);
    assert.equal(state.engine.prune.awaitingImpact, undefined);
  });

  it("pruneNegativeImpactCost returns 0 when no impact", () => {
    const s = { engine: { prune: { impact: undefined } }, stats: { savings: 0 } };
    assert.equal(mod.pruneNegativeImpactCost(s), 0);
  });

  it("pruneNegativeImpactCost sums costs", () => {
    const s = { engine: { prune: { impact: { summarizeCost: 0.05, postPruneMissCost: 0.03 } } }, stats: { savings: 0 } };
    assert.equal(mod.pruneNegativeImpactCost(s), 0.08);
  });

  it("recordPruneSummarizeImpact handles undefined cacheReadTokens in metrics", () => {
    // Ensure impact has summarizeByModel undefined and cacheReadTokens as undefined
    // by creating an impact with partial initial state that impactState won't replace
    const freshState = {
      engine: {
        prune: {
          impact: {
            summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0,
            summarizeCost: 0, summarizeToolCalls: 0,
            // Intentionally omit summarizeCacheReadTokens, summarizeRawChars, summarizeSummaryChars
            postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0,
            postPruneMissCost: 0, postPruneLookupRegret: 0, postPruneReadRegret: 0,
            postFoldReadRegret: 0, pendingBatchesPreservedDuringFlush: 0,
            pendingToolCallsPreservedDuringFlush: 0, lastPendingBatchesPreservedDuringFlush: 0,
            lastPendingToolCallsPreservedDuringFlush: 0, noOpToolCalls: 0, lastNoOpToolCalls: 0,
          },
        },
      },
      stats: { savings: 0 },
    };

    // First call with cacheReadTokens/rawChars/summaryChars omitted
    mod.recordPruneSummarizeImpact(freshState, {
      requests: 1, inputTokens: 2, outputTokens: 3, cost: 0.01, toolCalls: 4,
      modelId: "test-model",
    });
    const imp = freshState.engine.prune.impact;
    assert.equal(imp.summarizeCacheReadTokens, 0);
    assert.equal(imp.summarizeRawChars, 0);
    assert.equal(imp.summarizeSummaryChars, 0);
    assert.ok(imp.summarizeByModel);
    assert.equal(imp.summarizeByModel.length, 1);
  });

  it("recordPruneSummarizeImpact handles summarizeByModel undefined", () => {
    const s = {
      engine: {
        prune: {
          impact: {
            summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0,
            summarizeCost: 0, summarizeToolCalls: 0, summarizeRawChars: 0,
            summarizeSummaryChars: 0, summarizeCacheReadTokens: 0,
            // No summarizeByModel
            postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0,
            postPruneMissCost: 0, postPruneLookupRegret: 0, postPruneReadRegret: 0,
            postFoldReadRegret: 0, pendingBatchesPreservedDuringFlush: 0,
            pendingToolCallsPreservedDuringFlush: 0, lastPendingBatchesPreservedDuringFlush: 0,
            lastPendingToolCallsPreservedDuringFlush: 0, noOpToolCalls: 0, lastNoOpToolCalls: 0,
          },
        },
      },
      stats: { savings: 0 },
    };
    mod.recordPruneSummarizeImpact(s, {
      requests: 1, inputTokens: 10, outputTokens: 3, cost: 0.01, toolCalls: 2,
      modelId: "provider/model",
    });
    const imp = s.engine.prune.impact;
    assert.ok(imp.summarizeByModel);
    assert.equal(imp.summarizeByModel.length, 1);
    assert.equal(imp.summarizeByModel[0].modelId, "model");
    assert.equal(imp.summarizeByModel[0].provider, "provider");
  });

  it("pruneAdjustedSavings subtracts negative impact", () => { 
    state.stats.savings = 1000;
    state.engine.prune.impact.summarizeCost = 0.04;
    state.engine.prune.impact.postPruneMissCost = 0.01;
    assert.equal(mod.pruneAdjustedSavings(state), 999.95);
  });
});

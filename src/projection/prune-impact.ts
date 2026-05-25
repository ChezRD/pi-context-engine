import type { RuntimeState } from "../runtime-state.ts";
import { actualCostUsd, deepSeekOfficialCost } from "../stats.ts";
import type { SummarizePoolMetrics } from "./types.ts";
import type { UsageSnapshot } from "../types.ts";

function impactState(state: RuntimeState): RuntimeState["engine"]["prune"]["impact"] {
	if (!state.engine.prune.impact) {
		state.engine.prune.impact = {
			summarizeRequests: 0,
			summarizeInputTokens: 0,
			summarizeOutputTokens: 0,
			summarizeCost: 0,
			summarizeToolCalls: 0,
			summarizeRawChars: 0,
			summarizeSummaryChars: 0,
			summarizeCacheReadTokens: 0,
			summarizeByModel: [],
			postPruneRequests: 0,
			postPruneMissTokens: 0,
			postPruneCacheReadTokens: 0,
			postPruneMissCost: 0,
			postPruneLookupRegret: 0,
			postPruneReadRegret: 0,
			postFoldReadRegret: 0,
			pendingBatchesPreservedDuringFlush: 0,
			pendingToolCallsPreservedDuringFlush: 0,
			lastPendingBatchesPreservedDuringFlush: 0,
			lastPendingToolCallsPreservedDuringFlush: 0,
		};
	}
	state.engine.prune.impact.postPruneLookupRegret ??= 0;
	state.engine.prune.impact.postPruneReadRegret ??= 0;
	state.engine.prune.impact.postFoldReadRegret ??= 0;
	state.engine.prune.impact.pendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.pendingToolCallsPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingToolCallsPreservedDuringFlush ??= 0;
	return state.engine.prune.impact;
}

export function recordPruneSummarizeImpact(state: RuntimeState, metrics: SummarizePoolMetrics): void {
	const impact = impactState(state);
	if (metrics.error) impact.lastError = metrics.error;
	impact.summarizeRequests += metrics.requests;
	impact.summarizeInputTokens += metrics.inputTokens;
	impact.summarizeOutputTokens += metrics.outputTokens;
	impact.summarizeCacheReadTokens = (impact.summarizeCacheReadTokens ?? 0) + (metrics.cacheReadTokens ?? 0);
	impact.summarizeCost += metrics.cost;
	impact.summarizeToolCalls += metrics.toolCalls;
	impact.summarizeRawChars = (impact.summarizeRawChars ?? 0) + (metrics.rawChars ?? 0);
	impact.summarizeSummaryChars = (impact.summarizeSummaryChars ?? 0) + (metrics.summaryChars ?? 0);
	impact.lastSummarizeCost = metrics.cost;
	impact.lastSummarizeToolCalls = metrics.toolCalls;
	impact.lastSummarizeRawChars = metrics.rawChars ?? 0;
	impact.lastSummarizeSummaryChars = metrics.summaryChars ?? 0;
	if (metrics.modelId) {
		const slash = metrics.modelId.indexOf("/");
		const provider = slash > 0 ? metrics.modelId.slice(0, slash) : undefined;
		const modelId = slash > 0 ? metrics.modelId.slice(slash + 1) : metrics.modelId;
		const buckets = impact.summarizeByModel ?? (impact.summarizeByModel = []);
		let bucket = buckets.find((item) => item.modelId === modelId && item.provider === provider);
		if (!bucket) {
			bucket = { modelId, provider, requests: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, cost: 0 };
			buckets.push(bucket);
		}
		bucket.requests += metrics.requests;
		bucket.inputTokens += metrics.inputTokens;
		bucket.cacheReadTokens += metrics.cacheReadTokens ?? 0;
		bucket.outputTokens += metrics.outputTokens;
		bucket.cost += metrics.cost;
	}
	if (metrics.requests === 0) {
		impact.lastSummarizePrompt = undefined;
		impact.lastSummarizeResponse = undefined;
		impact.lastAcceptedSummaries = undefined;
		impact.lastSummarizeMaxTokens = undefined;
	}
	if (metrics.requests > 0 && !metrics.error) delete impact.lastError;
}

export function markAwaitingPruneImpact(state: RuntimeState, appliedIds: string[]): void {
	state.engine.prune.awaitingImpact = {
		turn: state.engine.turnIndex,
		appliedIds,
	};
}

export function recordPostPruneImpact(state: RuntimeState, usage: UsageSnapshot | undefined, modelCost?: any): void {
	if (!usage || !state.engine.prune.awaitingImpact) return;
	const impact = impactState(state);
	const pricing = usage.modelCost ?? deepSeekOfficialCost(usage.modelId) ?? modelCost;
	const missTokens = usage.input + usage.cacheWrite;
	const missCost = actualCostUsd({ input: missTokens, cacheRead: 0, cacheWrite: 0, output: 0 }, pricing);
	impact.postPruneRequests += 1;
	impact.postPruneMissTokens += missTokens;
	impact.postPruneCacheReadTokens += usage.cacheRead;
	impact.postPruneMissCost += missCost;
	impact.lastPostPruneHitRate = usage.hitRate;
	impact.lastPostPruneMissTokens = missTokens;
	impact.lastPostPruneMissCost = missCost;
	delete state.engine.prune.awaitingImpact;
}

export function pruneNegativeImpactCost(state: RuntimeState): number {
	const impact = state.engine.prune.impact;
	if (!impact) return 0;
	return impact.summarizeCost + impact.postPruneMissCost;
}

export function pruneAdjustedSavings(state: RuntimeState): number {
	return state.stats.savings - pruneNegativeImpactCost(state);
}

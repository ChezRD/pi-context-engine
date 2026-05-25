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
			postPruneRequests: 0,
			postPruneMissTokens: 0,
			postPruneCacheReadTokens: 0,
			postPruneMissCost: 0,
		};
	}
	return state.engine.prune.impact;
}

export function recordPruneSummarizeImpact(state: RuntimeState, metrics: SummarizePoolMetrics): void {
	const impact = impactState(state);
	if (metrics.error) impact.lastError = metrics.error;
	impact.summarizeRequests += metrics.requests;
	impact.summarizeInputTokens += metrics.inputTokens;
	impact.summarizeOutputTokens += metrics.outputTokens;
	impact.summarizeCost += metrics.cost;
	impact.summarizeToolCalls += metrics.toolCalls;
	impact.summarizeRawChars = (impact.summarizeRawChars ?? 0) + (metrics.rawChars ?? 0);
	impact.summarizeSummaryChars = (impact.summarizeSummaryChars ?? 0) + (metrics.summaryChars ?? 0);
	impact.lastSummarizeCost = metrics.cost;
	impact.lastSummarizeToolCalls = metrics.toolCalls;
	impact.lastSummarizeRawChars = metrics.rawChars ?? 0;
	impact.lastSummarizeSummaryChars = metrics.summaryChars ?? 0;
	if (metrics.requests === 0) {
		impact.lastSummarizePrompt = undefined;
		impact.lastSummarizeResponse = undefined;
		impact.lastAcceptedSummaries = undefined;
		impact.lastSummarizeMaxTokens = undefined;
	}
	if (metrics.requests > 0) delete impact.lastError;
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

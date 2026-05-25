import type { CacheStats, UsageSnapshot, ModelCost } from "./types.ts";
import type { RuntimeState } from "./runtime-state.ts";

export type { ModelCost } from "./types.ts";

export interface ModelUsageSummary {
	modelId: string;
	provider?: string;
	requests: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	hitRate?: number;
	actualCost: number;
	noCacheCost?: number;
	savings?: number;
	pricingKnown: boolean;
}

export interface SegmentUsageSummary {
	segmentId: string;
	checkpointId?: string;
	checkpointReason?: string;
	modelId?: string;
	requests: number;
	warmupRequests: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	hitRate?: number;
	warmHitRate?: number;
	actualCost: number;
	noCacheCost?: number;
	savings?: number;
}

export const DEEPSEEK_OFFICIAL_PRICING_2026_05: Record<"flash" | "pro", Required<ModelCost>> = {
	// Source: https://api-docs.deepseek.com/quick_start/pricing/
	// Units: USD per 1M tokens. Cache write is not priced separately by DeepSeek API.
	flash: { input: 0.14, cacheRead: 0.0028, cacheWrite: 0, output: 0.28 },
	pro: { input: 0.435, cacheRead: 0.003625, cacheWrite: 0, output: 0.87 },
};

export function deepSeekOfficialCost(modelId: string | undefined): Required<ModelCost> | undefined {
	const model = String(modelId ?? "").toLowerCase();
	if (model.includes("pro")) return DEEPSEEK_OFFICIAL_PRICING_2026_05.pro;
	if (model.includes("flash") || model === "deepseek-chat" || model === "deepseek-reasoner" || model.includes("deepseek")) return DEEPSEEK_OFFICIAL_PRICING_2026_05.flash;
	return undefined;
}

export function emptyStats(): CacheStats {
	return { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0, savings: 0, sinceCompactionRequests: 0, usages: [], compacts: [] };
}

function readNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readCostTotal(cost: unknown): number | undefined {
	if (typeof cost === "number" && Number.isFinite(cost)) return cost;
	if (cost && typeof cost === "object" && typeof (cost as any).total === "number") return (cost as any).total;
	return undefined;
}

function resolveModelCost(modelId: string | undefined, modelCost: ModelCost | undefined): ModelCost | undefined {
	return deepSeekOfficialCost(modelId) ?? modelCost;
}

export function usageTotalInput(usage: { input?: number; cacheRead?: number; cacheWrite?: number } | undefined): number {
	return readNumber(usage?.input) + readNumber(usage?.cacheRead) + readNumber(usage?.cacheWrite);
}

export function extractUsageSnapshot(messageOrUsage: any): UsageSnapshot | undefined {
	const usage = messageOrUsage?.usage ?? messageOrUsage;
	if (!usage || typeof usage !== "object") return undefined;
	const input = readNumber(usage.input);
	const cacheRead = readNumber(usage.cacheRead);
	const cacheWrite = readNumber(usage.cacheWrite);
	const output = readNumber(usage.output);
	const hasUsage = input > 0 || cacheRead > 0 || cacheWrite > 0 || output > 0;
	if (!hasUsage) return undefined;
	const totalInput = input + cacheRead + cacheWrite;
	return {
		input,
		cacheRead,
		cacheWrite,
		output,
		totalInput,
		hitRate: totalInput > 0 ? cacheRead / totalInput : 0,
		cost: readCostTotal(usage.cost),
		requestId: typeof messageOrUsage?.id === "string" ? messageOrUsage.id : undefined,
		createdAt: Date.now(),
	};
}

export function savingsFromRealCost(usage: { input?: number; cacheRead?: number; cacheWrite?: number; output?: number; cost?: number } | undefined, modelCost: ModelCost | undefined): number {
	if (!usage || !modelCost || typeof modelCost.input !== "number" || typeof modelCost.output !== "number" || typeof usage.cost !== "number") return 0;
	return Math.max(0, noCacheCostUsd(usage, modelCost) - usage.cost);
}

export function cacheSavingsUsdFromCost(modelCost: ModelCost | undefined, cacheReadTokens: number): number {
	if (!modelCost || typeof modelCost.input !== "number" || typeof modelCost.cacheRead !== "number") return 0;
	return Math.max(0, cacheReadTokens * (modelCost.input - modelCost.cacheRead) / 1_000_000);
}

export function noCacheCostUsd(usage: { input?: number; cacheRead?: number; cacheWrite?: number; output?: number } | undefined, modelCost: ModelCost | undefined): number {
	if (!usage || !modelCost || typeof modelCost.input !== "number" || typeof modelCost.output !== "number") return 0;
	const totalInput = usageTotalInput(usage);
	return totalInput * modelCost.input / 1_000_000 + readNumber(usage.output) * modelCost.output / 1_000_000;
}

export function cacheSavingsUsd(modelId: string | undefined, hitTokens: number): number {
	const pricing = deepSeekOfficialCost(modelId);
	return pricing ? hitTokens * (pricing.input - pricing.cacheRead) / 1_000_000 : 0;
}

export function actualCostUsd(usage: { input?: number; cacheRead?: number; cacheWrite?: number; output?: number; cost?: number } | undefined, modelCost: ModelCost | undefined): number {
	if (!usage) return 0;
	if (typeof usage.cost === "number") return usage.cost;
	if (!modelCost || typeof modelCost.input !== "number" || typeof modelCost.output !== "number") return 0;
	const input = readNumber(usage.input);
	const cacheRead = readNumber(usage.cacheRead);
	const cacheWrite = readNumber(usage.cacheWrite);
	return (input * modelCost.input + cacheRead * readNumber(modelCost.cacheRead) + cacheWrite * readNumber(modelCost.cacheWrite) + readNumber(usage.output) * modelCost.output) / 1_000_000;
}

export function costToCompact(usage: Pick<UsageSnapshot, "input" | "cacheRead" | "cacheWrite"> | undefined, modelCost: ModelCost | undefined): number {
	if (!usage || !modelCost || typeof modelCost.input !== "number" || typeof modelCost.cacheRead !== "number") return 0;
	const input = readNumber(usage.input);
	const cacheReadTokens = readNumber(usage.cacheRead);
	const cacheWriteTokens = readNumber(usage.cacheWrite);
	const nonCached = Math.max(0, input - cacheReadTokens - cacheWriteTokens);
	const current = (nonCached * modelCost.input + cacheReadTokens * modelCost.cacheRead + cacheWriteTokens * readNumber(modelCost.cacheWrite)) / 1_000_000;
	const compact = input * modelCost.input / 1_000_000;
	return Math.max(0, compact - current);
}

export function addUsage(stats: CacheStats, snapshot: UsageSnapshot | undefined, modelId?: string, modelCost?: ModelCost): CacheStats {
	if (!snapshot) return stats;
	const effectiveModelId = snapshot.modelId ?? modelId;
	const effectiveCost = resolveModelCost(effectiveModelId, snapshot.modelCost ?? modelCost);
	const cost = actualCostUsd(snapshot, effectiveCost);
	const noCacheCost = noCacheCostUsd(snapshot, effectiveCost);
	const savings = (noCacheCost > 0 && cost > 0 ? Math.max(0, noCacheCost - cost) : 0) || cacheSavingsUsdFromCost(effectiveCost, snapshot.cacheRead);
	const nextSnapshot = {
		...snapshot,
		modelId: effectiveModelId,
		modelCost: effectiveCost,
		cost,
		actualCost: cost,
		noCacheCost,
		savings,
		totalInput: snapshot.totalInput ?? snapshot.input + snapshot.cacheRead + snapshot.cacheWrite,
		hitRate: snapshot.hitRate ?? hitRatio(snapshot.input, snapshot.cacheRead, snapshot.cacheWrite) ?? 0,
	};
	return {
		requests: stats.requests + 1,
		input: stats.input + snapshot.input,
		cacheRead: stats.cacheRead + snapshot.cacheRead,
		cacheWrite: stats.cacheWrite + snapshot.cacheWrite,
		output: stats.output + snapshot.output,
		cost: stats.cost + cost,
		savings: stats.savings + savings,
		sinceCompactionRequests: stats.sinceCompactionRequests + 1,
		last: nextSnapshot,
		usages: [...(stats.usages ?? []), nextSnapshot],
		compacts: stats.compacts ?? [],
	};
}

function accumulateUsage<T extends { requests: number; input: number; cacheRead: number; cacheWrite: number; output: number; actualCost: number }>(target: T, usage: UsageSnapshot): T {
	target.requests++;
	target.input += usage.input;
	target.cacheRead += usage.cacheRead;
	target.cacheWrite += usage.cacheWrite;
	target.output += usage.output;
	target.actualCost += usage.actualCost ?? usage.cost ?? 0;
	return target;
}

export function aggregateByModel(usages: UsageSnapshot[]): ModelUsageSummary[] {
	const byModel = new Map<string, ModelUsageSummary>();
	for (const usage of usages ?? []) {
		const modelId = usage.modelId ?? "unknown";
		let summary = byModel.get(modelId);
		if (!summary) {
			summary = { modelId, provider: usage.provider, requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, actualCost: 0, noCacheCost: 0, savings: 0, pricingKnown: false };
			byModel.set(modelId, summary);
		}
		accumulateUsage(summary, usage);
		if (!summary.provider && usage.provider) summary.provider = usage.provider;
		if (usage.modelCost && typeof usage.modelCost.input === "number" && typeof usage.modelCost.output === "number") summary.pricingKnown = true;
		if (summary.noCacheCost !== undefined) summary.noCacheCost += usage.noCacheCost ?? 0;
		if (summary.savings !== undefined) summary.savings += usage.savings ?? 0;
	}
	for (const summary of byModel.values()) {
		summary.hitRate = hitRatio(summary.input, summary.cacheRead, summary.cacheWrite);
		if (!summary.pricingKnown) {
			summary.noCacheCost = undefined;
			summary.savings = undefined;
		}
	}
	return [...byModel.values()];
}

export function warmHitRate(usages: UsageSnapshot[]): number | undefined {
	const warm = (usages ?? []).filter((usage) => usage.warmup !== true);
	const input = warm.reduce((sum, usage) => sum + usage.input, 0);
	const cacheRead = warm.reduce((sum, usage) => sum + usage.cacheRead, 0);
	const cacheWrite = warm.reduce((sum, usage) => sum + usage.cacheWrite, 0);
	return hitRatio(input, cacheRead, cacheWrite);
}

export function aggregateBySegment(usages: UsageSnapshot[]): SegmentUsageSummary[] {
	const bySegment = new Map<string, { summary: SegmentUsageSummary; usages: UsageSnapshot[] }>();
	for (const usage of usages ?? []) {
		const segmentId = usage.segmentId ?? "unknown";
		let bucket = bySegment.get(segmentId);
		if (!bucket) {
			bucket = {
				summary: { segmentId, checkpointId: usage.checkpointId, checkpointReason: usage.checkpointReason, modelId: usage.modelId, requests: 0, warmupRequests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, actualCost: 0, noCacheCost: 0, savings: 0 },
				usages: [],
			};
			bySegment.set(segmentId, bucket);
		}
		accumulateUsage(bucket.summary, usage);
		bucket.usages.push(usage);
		if (usage.warmup) bucket.summary.warmupRequests++;
		if (bucket.summary.noCacheCost !== undefined) bucket.summary.noCacheCost += usage.noCacheCost ?? 0;
		if (bucket.summary.savings !== undefined) bucket.summary.savings += usage.savings ?? 0;
		if (!bucket.summary.modelId && usage.modelId) bucket.summary.modelId = usage.modelId;
		if (!bucket.summary.checkpointReason && usage.checkpointReason) bucket.summary.checkpointReason = usage.checkpointReason;
	}
	return [...bySegment.values()].map((bucket) => ({
		...bucket.summary,
		hitRate: hitRatio(bucket.summary.input, bucket.summary.cacheRead, bucket.summary.cacheWrite),
		warmHitRate: warmHitRate(bucket.usages),
	}));
}

export function currentSegmentStats(state: RuntimeState): CacheStats {
	const usages = (state.stats.usages ?? []).filter((usage) => usage.segmentId === state.engine.currentSegmentId);
	return usages.reduce((stats, usage) => ({
		requests: stats.requests + 1,
		input: stats.input + usage.input,
		cacheRead: stats.cacheRead + usage.cacheRead,
		cacheWrite: stats.cacheWrite + usage.cacheWrite,
		output: stats.output + usage.output,
		cost: stats.cost + (usage.actualCost ?? usage.cost ?? 0),
		savings: stats.savings + (usage.savings ?? 0),
		sinceCompactionRequests: stats.sinceCompactionRequests + 1,
		last: usage,
		usages: [...stats.usages, usage],
		compacts: state.stats.compacts ?? [],
	}), emptyStats());
}

export function markCompaction(stats: CacheStats, record?: { turn: number; reason: "auto" | "manual" | "host"; completed: boolean; errorKey?: string }): CacheStats {
	return { ...stats, sinceCompactionRequests: 0, compacts: record ? [...(stats.compacts ?? []), record] : stats.compacts ?? [] };
}

export function sessionHitRateAfterWarmup(usages: UsageSnapshot[], warmupTurns = 1): number {
	const xs = usages.filter((usage) => (usage.turn ?? 0) > warmupTurns);
	const total = xs.reduce((sum, usage) => sum + (usage.totalInput ?? usage.input + usage.cacheRead + usage.cacheWrite), 0);
	const read = xs.reduce((sum, usage) => sum + usage.cacheRead, 0);
	return total > 0 ? read / total : 0;
}

export function hitRatio(input: number, cacheRead: number, cacheWrite = 0): number | undefined {
	const total = input + cacheRead + cacheWrite;
	return total > 0 ? cacheRead / total : undefined;
}

export function computeHitRatio(input: number, cacheRead: number, cacheWrite = 0): number {
	return hitRatio(input, cacheRead, cacheWrite) ?? 0;
}

export function formatRatio(ratio: number | undefined): string {
	return typeof ratio === "number" ? `${(ratio * 100).toFixed(1)}%` : "n/a";
}

export function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}k`;
	return String(Math.round(tokens));
}

export function formatStatus(stats: CacheStats, contextPct?: number): string {
	const ratio = hitRatio(stats.input, stats.cacheRead, stats.cacheWrite);
	const parts = [`DS cache ${formatRatio(ratio)}`];
	if (stats.requests > 0) parts.push(`input ${formatTokenCount(stats.input)}`, `read ${formatTokenCount(stats.cacheRead)}`);
	if (stats.savings > 0) parts.push(`saved $${stats.savings.toFixed(4)}`);
	if (typeof contextPct === "number") parts.push(`ctx ${Math.round(contextPct * 100)}%`);
	return parts.join(" · ");
}

export function formatStats(stats: CacheStats): string {
	const sessionRatio = hitRatio(stats.input, stats.cacheRead, stats.cacheWrite);
	const lastRatio = stats.last ? hitRatio(stats.last.input, stats.last.cacheRead, stats.last.cacheWrite) : undefined;
	return [
		`requests: ${stats.requests}`,
		`session_hit_ratio: ${formatRatio(sessionRatio)}`,
		`last_hit_ratio: ${formatRatio(lastRatio)}`,
		`input_tokens: ${Math.round(stats.input)}`,
		`cache_read_tokens: ${Math.round(stats.cacheRead)}`,
		`cache_write_tokens: ${Math.round(stats.cacheWrite)}`,
		`output_tokens: ${Math.round(stats.output)}`,
		`estimated_cost: ${stats.cost ? `$${stats.cost.toFixed(6)}` : "n/a"}`,
		`estimated_cache_savings: ${stats.savings ? `$${stats.savings.toFixed(6)}` : "n/a"}`,
		`requests_since_compaction: ${stats.sinceCompactionRequests}`,
	].join("\n");
}

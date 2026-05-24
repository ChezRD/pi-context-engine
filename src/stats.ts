import type { CacheStats, UsageSnapshot } from "./types.ts";

export interface ModelCost {
	input?: number;
	cacheRead?: number;
	cacheWrite?: number;
	output?: number;
}

export const DEEPSEEK_OFFICIAL_PRICING_2026_05: Record<"flash" | "pro", Required<ModelCost>> = {
	// Source: https://api-docs.deepseek.com/quick_start/pricing/
	// Units: USD per 1M tokens. Cache write is not priced separately by DeepSeek API/Pi model metadata.
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
	const totalInput = usageTotalInput(usage);
	const noCacheCost = totalInput * modelCost.input / 1_000_000 + readNumber(usage.output) * modelCost.output / 1_000_000;
	return Math.max(0, noCacheCost - usage.cost);
}

export function cacheSavingsUsdFromCost(modelCost: ModelCost | undefined, cacheReadTokens: number): number {
	if (!modelCost || typeof modelCost.input !== "number" || typeof modelCost.cacheRead !== "number") return 0;
	return Math.max(0, cacheReadTokens * (modelCost.input - modelCost.cacheRead) / 1_000_000);
}

export function cacheSavingsUsd(modelId: string | undefined, hitTokens: number): number {
	const pricing = deepSeekOfficialCost(modelId);
	return pricing ? hitTokens * (pricing.input - pricing.cacheRead) / 1_000_000 : 0;
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
	const savings = savingsFromRealCost(snapshot, modelCost) || cacheSavingsUsdFromCost(modelCost, snapshot.cacheRead) || cacheSavingsUsd(modelId, snapshot.cacheRead);
	const nextSnapshot = { ...snapshot, savings, totalInput: snapshot.totalInput ?? snapshot.input + snapshot.cacheRead + snapshot.cacheWrite, hitRate: snapshot.hitRate ?? hitRatio(snapshot.input, snapshot.cacheRead, snapshot.cacheWrite) ?? 0 };
	return {
		requests: stats.requests + 1,
		input: stats.input + snapshot.input,
		cacheRead: stats.cacheRead + snapshot.cacheRead,
		cacheWrite: stats.cacheWrite + snapshot.cacheWrite,
		output: stats.output + snapshot.output,
		cost: stats.cost + (snapshot.cost ?? 0),
		savings: stats.savings + savings,
		sinceCompactionRequests: stats.sinceCompactionRequests + 1,
		last: nextSnapshot,
		usages: [...(stats.usages ?? []), nextSnapshot],
		compacts: stats.compacts ?? [],
	};
}

export function markCompaction(stats: CacheStats, record?: { turn: number; reason: "auto" | "manual" | "host"; completed: boolean; error?: string }): CacheStats {
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
	return typeof ratio === "number" ? `${Math.round(ratio * 100)}%` : "n/a";
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

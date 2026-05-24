import type { CacheStats, UsageSnapshot } from "./types.ts";

export function emptyStats(): CacheStats {
	return { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0, sinceCompactionRequests: 0 };
}

function readNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
	return {
		input,
		cacheRead,
		cacheWrite,
		output,
		cost: typeof usage.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : undefined,
		requestId: typeof messageOrUsage?.id === "string" ? messageOrUsage.id : undefined,
		createdAt: Date.now(),
	};
}

export function addUsage(stats: CacheStats, snapshot: UsageSnapshot | undefined): CacheStats {
	if (!snapshot) return stats;
	return {
		requests: stats.requests + 1,
		input: stats.input + snapshot.input,
		cacheRead: stats.cacheRead + snapshot.cacheRead,
		cacheWrite: stats.cacheWrite + snapshot.cacheWrite,
		output: stats.output + snapshot.output,
		cost: stats.cost + (snapshot.cost ?? 0),
		sinceCompactionRequests: stats.sinceCompactionRequests + 1,
		last: snapshot,
	};
}

export function markCompaction(stats: CacheStats): CacheStats {
	return { ...stats, sinceCompactionRequests: 0 };
}

export function hitRatio(input: number, cacheRead: number): number | undefined {
	const denom = input + cacheRead;
	return denom > 0 ? cacheRead / denom : undefined;
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
	const ratio = hitRatio(stats.input, stats.cacheRead);
	const parts = [`DS cache ${formatRatio(ratio)}`];
	if (stats.requests > 0) parts.push(`uncached ${formatTokenCount(stats.input)}`, `read ${formatTokenCount(stats.cacheRead)}`);
	if (typeof contextPct === "number") parts.push(`ctx ${Math.round(contextPct * 100)}%`);
	return parts.join(" · ");
}

export function formatStats(stats: CacheStats): string {
	const sessionRatio = hitRatio(stats.input, stats.cacheRead);
	const lastRatio = stats.last ? hitRatio(stats.last.input, stats.last.cacheRead) : undefined;
	return [
		`requests: ${stats.requests}`,
		`session_hit_ratio: ${formatRatio(sessionRatio)}`,
		`last_hit_ratio: ${formatRatio(lastRatio)}`,
		`uncached_input_tokens: ${Math.round(stats.input)}`,
		`cache_read_tokens: ${Math.round(stats.cacheRead)}`,
		`cache_write_tokens: ${Math.round(stats.cacheWrite)}`,
		`output_tokens: ${Math.round(stats.output)}`,
		`estimated_cost: ${stats.cost ? `$${stats.cost.toFixed(6)}` : "n/a"}`,
		`requests_since_compaction: ${stats.sinceCompactionRequests}`,
	].join("\n");
}

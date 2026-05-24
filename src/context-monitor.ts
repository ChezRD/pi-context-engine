import type { ExtensionConfig } from "./config.ts";
import type { ContextRecommendation } from "./types.ts";

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getContextPercent(usage: any): number | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	const direct = readNumber(usage.percent ?? usage.pct ?? usage.ratio);
	if (direct !== undefined) return direct > 1 ? direct / 100 : direct;
	const used = readNumber(usage.usedTokens ?? usage.contextTokens ?? usage.tokens ?? usage.totalTokens);
	const max = readNumber(usage.contextWindow ?? usage.maxTokens ?? usage.limitTokens ?? usage.limit);
	if (used !== undefined && max && max > 0) return used / max;
	return undefined;
}

export async function readContextPercent(ctx: any): Promise<number | undefined> {
	if (!ctx || typeof ctx.getContextUsage !== "function") return undefined;
	try {
		return getContextPercent(await ctx.getContextUsage());
	} catch {
		return undefined;
	}
}

export function recommendContextAction(percent: number | undefined, config: ExtensionConfig): ContextRecommendation {
	if (percent === undefined) return { level: "off", message: "context_usage: unavailable" };
	if (percent >= config.contextCompactPct) {
		return { percent, level: "danger", message: "context_usage: high. Run /pruner now if pruning pending; otherwise /compact." };
	}
	if (percent >= config.contextDangerPct) {
		return { percent, level: "danger", message: "context_usage: danger. Prefer checkpoint + /pruner now before broad tool calls." };
	}
	if (percent >= config.contextWarnPct) {
		return { percent, level: "warn", message: "context_usage: rising. Use pi-context-prune for long DeepSeek sessions." };
	}
	return { percent, level: "ok", message: "context_usage: ok" };
}

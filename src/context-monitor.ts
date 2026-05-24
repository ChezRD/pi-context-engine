import type { ExtensionConfig } from "./config.ts";
import type { ContextRecommendation } from "./types.ts";
import { t } from "./i18n/index.ts";

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
	if (percent === undefined) return { level: "off", message: t(config, "context.unavailable") };
	if (percent >= config.contextCompactPct) return { percent, level: "danger", message: t(config, "context.compact") };
	if (percent >= config.contextDangerPct) return { percent, level: "danger", message: t(config, "context.danger") };
	if (percent >= config.contextWarnPct) return { percent, level: "warn", message: t(config, "context.warn") };
	return { percent, level: "ok", message: t(config, "context.ok") };
}

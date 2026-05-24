import type { ExtensionConfig } from "../config.ts";
import type { CacheStats } from "../types.ts";
import { hitRatio } from "../stats.ts";
import { t } from "../i18n/index.ts";
import type { RuntimeState } from "../runtime-state.ts";

export type CacheZone = "green" | "yellow" | "orange" | "red" | "critical";
export type CacheDecisionAction = "hold" | "advise" | "fold" | "force_fold";

export interface ContextUsageStatus {
	ratio?: number;
	tokens?: number;
	max?: number;
	hitRate?: number;
	turnGrowth?: number;
	turnsToOverflow?: number;
	zone: CacheZone;
	decision: CacheDecisionAction;
}

function readNum(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readContextUsage(ctx: any): { ratio?: number; tokens?: number; max?: number } {
	try {
		const usage = ctx?.getContextUsage?.();
		if (!usage || typeof usage !== "object") return {};
		const tokens = readNum(usage.promptTokens ?? usage.tokens ?? usage.usedTokens ?? usage.contextTokens ?? usage.totalTokens);
		const max = readNum(usage.contextWindow ?? usage.ctxMax ?? usage.maxTokens ?? usage.limitTokens ?? usage.limit);
		const direct = readNum(usage.percent ?? usage.pct ?? usage.ratio);
		const ratio = direct !== undefined ? (direct > 1 ? direct / 100 : direct) : tokens !== undefined && max ? tokens / max : undefined;
		return { ratio, tokens, max };
	} catch {
		return {};
	}
}

export function zoneForRatio(ratio: number | undefined, config: ExtensionConfig): CacheZone {
	if (ratio === undefined) return "green";
	if (ratio >= config.contextForceFoldPct) return "critical";
	if (ratio >= config.contextCompactPct) return "red";
	if (ratio >= config.contextDangerPct) return "orange";
	if (ratio >= config.contextWarnPct) return "yellow";
	return "green";
}

export function buildContextStatus(ctx: any, stats: CacheStats, config: ExtensionConfig): ContextUsageStatus {
	const usage = readContextUsage(ctx);
	const turnGrowth = stats.last ? stats.last.input + stats.last.cacheRead + stats.last.cacheWrite + stats.last.output : undefined;
	const turnsToOverflow = usage.tokens !== undefined && usage.max && turnGrowth && turnGrowth > 0
		? Math.max(0, Math.floor((usage.max * config.contextForceFoldPct - usage.tokens) / turnGrowth))
		: undefined;
	const hit = hitRatio(stats.input, stats.cacheRead, stats.cacheWrite);
	const zone = zoneForRatio(usage.ratio, config);
	return { ...usage, hitRate: hit, turnGrowth, turnsToOverflow, zone, decision: decideCompaction({ ratio: usage.ratio, hitRate: hit }, config) };
}

export function decideCompaction(status: Pick<ContextUsageStatus, "ratio" | "hitRate">, config: ExtensionConfig): CacheDecisionAction {
	const ratio = status.ratio ?? 0;
	const hit = status.hitRate ?? 0;
	if (ratio >= config.contextForceFoldPct) return "force_fold";
	if (ratio >= config.contextCompactPct) return "fold";
	if (ratio >= 0.75 && hit < config.foldHitRateThreshold) return "fold";
	if (ratio >= config.contextDangerPct) return "advise";
	return "hold";
}

export function canCompactNow(state: RuntimeState): boolean {
	if (state.engine.compactCount >= state.config.maxCompactsPerSession) return false;
	if (state.engine.lastCompactTurn === undefined) return true;
	return state.engine.turnIndex - state.engine.lastCompactTurn >= state.config.minTurnsBetweenCompacts;
}

export function decisionLabel(action: CacheDecisionAction): string {
	return t(`engine.decision.${action}`);
}

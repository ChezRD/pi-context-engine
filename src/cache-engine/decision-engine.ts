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

// --- Post-usage decision engine (Reasonix-style) ---

export type PostUsageDecisionKind = "none" | "fold" | "exit-with-summary";

export interface PostUsageDecision {
	kind: PostUsageDecisionKind;
	promptTokens: number;
	ctxMax: number;
	ratio: number;
	tailBudget?: number;
	aggressive?: boolean;
}

/**
 * Three-tier decision engine based on Reasonix context-manager.ts.
 * Called after each turn completes, using prompt token usage.
 */
export function decideAfterUsage(
	promptTokens: number | undefined,
	ctxMax: number | undefined,
	alreadyFoldedThisTurn: boolean,
	config: ExtensionConfig,
): PostUsageDecision {
	const max = ctxMax ?? 0;
	const tokens = promptTokens ?? 0;
	if (max <= 0) return { kind: "none", promptTokens: tokens, ctxMax: max, ratio: 0 };

	const ratio = tokens / max;

	// Already folded this turn → nothing to do
	if (alreadyFoldedThisTurn) return { kind: "none", promptTokens: tokens, ctxMax: max, ratio };

	// Force-exit with summary (>80%)
	if (ratio >= config.exitSummaryThreshold) {
		return { kind: "exit-with-summary", promptTokens: tokens, ctxMax: max, ratio };
	}

	// Aggressive fold (>78%)
	if (ratio >= config.aggressiveFoldThreshold) {
		return { kind: "fold", promptTokens: tokens, ctxMax: max, ratio, tailBudget: config.aggressiveFoldTailPct, aggressive: true };
	}

	// Normal fold (>75%)
	if (ratio >= config.foldThreshold) {
		return { kind: "fold", promptTokens: tokens, ctxMax: max, ratio, tailBudget: config.foldTailPct, aggressive: false };
	}

	// Below threshold
	return { kind: "none", promptTokens: tokens, ctxMax: max, ratio };
}

/**
 * Pre-flight estimate at turn start.
 * If context > 90%, trigger a fold before the turn begins.
 */
export function estimateTurnStart(
	ctx: any,
	config: ExtensionConfig,
): { shouldFold: boolean; ratio: number } {
	const usage = readContextUsage(ctx);
	const ratio = usage.ratio ?? 0;
	return {
		shouldFold: ratio >= config.preflightFoldThreshold,
		ratio,
	};
}

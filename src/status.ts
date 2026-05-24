import { isDeepSeekDetectionActive } from "./model.ts";
import { recommendContextAction } from "./context-monitor.ts";
import { detectPruner } from "./pruner-advisor.ts";
import { getConfigPath } from "./config.ts";
import { formatRatio, formatTokenCount, hitRatio, sessionHitRateAfterWarmup } from "./stats.ts";
import { buildContextStatus, decisionLabel } from "./cache-engine/index.ts";
import type { CacheDecisionAction } from "./cache-engine/decision-engine.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { STATUS_KEY } from "./runtime-state.ts";
import { t } from "./i18n/index.ts";

export function setStatus(ctx: any, state: RuntimeState): void {
	if (!state.config.statusLine || !ctx?.ui?.setStatus) return;
	if (!state.config.enabled || !isDeepSeekDetectionActive(state.detection)) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const rec = recommendContextAction(state.contextPct, state.config);
	const suffix = rec.level === "warn" ? " ⚠" : rec.level === "danger" ? " ⛔" : "";
	ctx.ui.setStatus(STATUS_KEY, `${formatStatusLine(ctx, state)}${suffix}`);
}

function formatStatusLine(ctxArg: any, state: RuntimeState): string {
	const status = buildContextStatus(ctxArg ?? { getContextUsage: () => ({ ratio: state.contextPct }) }, state.stats, state.config);
	const emoji = status.zone === "critical" ? "🌧" : status.zone === "red" ? "🌥" : status.zone === "orange" ? "⛅" : status.zone === "yellow" ? "🌤" : "☀";
	const hit = formatRatio(hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite));
	const ratio = status.ratio ?? state.contextPct;
	const ctx = ratio === undefined ? t(state.config, "status.ctxUnavailable") : t(state.config, "status.ctxPct", { pct: Math.round(ratio * 100) });
	const turns = state.config.showTurnEstimate && status.zone !== "green" && status.turnsToOverflow !== undefined ? t(state.config, "status.turns", { turns: status.turnsToOverflow }) : "";
	const savings = state.config.showCostSavings && state.stats.savings > 0 ? ` · $${state.stats.savings.toFixed(2)}` : "";
	const prefix = state.engine.prefixDriftCount > 0 ? t(state.config, "status.prefixDrift", { count: state.engine.prefixDriftCount }) : t(state.config, "status.prefixOk");
	return t(state.config, "status.line", { emoji, ctx, hit, turns, savings, prefix, decision: decisionLabel(status.decision) });
}

export function buildStatus(pi: any, state: RuntimeState): string {
	return [
		t(state.config, "status.title"),
		`  ${t(state.config, "status.model")}: ${formatModelLine(state)}`,
		`  ${t(state.config, "status.cache")}: ${formatCacheLine(state)}`,
		`  ${t(state.config, "status.context")}: ${formatContextLine(state)}`,
		`  Engine: prefix changes ${state.engine.prefixDriftCount} · history rewrites ${state.engine.historyRewriteCount} · ${formatDecision(state)}`,
		`  ${t(state.config, "status.hashLine", { prefixHash: state.engine.prefixHash?.slice(0, 12) ?? t(state.config, "status.unknown"), toolHash: state.engine.toolHash?.slice(0, 12) ?? t(state.config, "status.unknown"), tools: state.engine.toolHashChanges, reason: state.engine.lastPrefixChangeReason ?? t(state.config, "status.notReported") })}`,
		`  ${t(state.config, "status.prefixNotification", { turn: state.engine.lastPrefixWarningTurn ?? t(state.config, "status.notReported"), suppressed: state.engine.lastPrefixNotificationSuppressed ? t(state.config, "status.yes") : t(state.config, "status.no") })}`,
		`  ${t(state.config, "status.projectionLine", { active: state.engine.appendOnly.projectionActive ? t(state.config, "status.enabled") : t(state.config, "status.disabled"), tail: state.engine.appendOnly.tailStartEntryId ?? t(state.config, "status.notReported"), reason: state.engine.appendOnly.invalidatedReason ?? t(state.config, "status.notReported") })}`,
		`  ${formatEligibility(pi, state)}`,
	].join("\n");
}

export function buildDetailedStatus(pi: any, state: RuntimeState): string {
	return [
		t(state.config, "status.detailsTitle"),
		"",
		formatModelDetails(state),
		"",
		formatCacheDetails(state),
		"",
		formatContextDetails(state),
		"",
		formatConfigDetails(pi, state),
	].join("\n");
}

function formatCompactionHistory(state: RuntimeState): string {
	const records = state.stats.compacts ?? [];
	if (!records.length) return t(state.config, "status.compactionHistory", { history: t(state.config, "status.notReported") });
	const history = records.slice(-3).map((record) => `${record.reason}@${record.turn}:${record.completed ? "completed" : "failed"}`).join(", ");
	return t(state.config, "status.compactionHistory", { history });
}

function formatEligibility(pi: any, state: RuntimeState): string {
	const pruner = detectPruner(pi);
	const compactStorm = state.engine.compactCount > state.config.maxCompactsPerSession;
	const blockers: string[] = [];
	if (state.engine.prefixDriftCount > 0) blockers.push(t(state.config, "status.blockerPrefix", { count: state.engine.prefixDriftCount, reason: state.engine.lastPrefixChangeReason ?? t(state.config, "status.unknown") }));
	if (state.engine.toolHashChanges > 0) blockers.push(t(state.config, "status.blockerTools", { count: state.engine.toolHashChanges }));
	if (pruner.cacheProfile === "bad") blockers.push(t(state.config, "status.blockerPruner", { reason: pruner.cacheProfileReason }));
	if (compactStorm) blockers.push(t(state.config, "status.blockerStorm"));
	const warmHit = sessionHitRateAfterWarmup(state.stats.usages ?? []);
	const warmUsages = (state.stats.usages ?? []).filter((usage) => (usage.turn ?? 0) > 1);
	const warmHitText = warmUsages.length ? formatRatio(warmHit) : t(state.config, "status.notReported");
	if (blockers.length === 0) return t(state.config, "status.eligible99", { hit: warmHitText });
	return t(state.config, "status.blocked99", { reason: blockers.join("; ") });
}

function formatDecision(state: RuntimeState): string {
	const decision = state.engine.lastDecision;
	const safe: CacheDecisionAction = decision === "advise" || decision === "fold" || decision === "force_fold" || decision === "hold" ? decision : "hold";
	return decisionLabel(safe);
}

function formatModelLine(state: RuntimeState): string {
	const model = `${state.detection.provider ?? "unknown"}/${state.detection.modelId ?? "unknown"}`;
	if (state.detection.kind === "not-deepseek") return `${model} (${t(state.config, "status.notDeepSeek.short")})`;
	return `${model} ${state.detection.ok ? "✓" : "⚠"}`;
}

function formatCacheLine(state: RuntimeState): string {
	if (state.stats.requests === 0) return t(state.config, "status.noUsage");
	const sessionRatio = hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite);
	const lastRatio = state.stats.last ? hitRatio(state.stats.last.input, state.stats.last.cacheRead, state.stats.last.cacheWrite) : undefined;
	return t(state.config, "status.cacheLine", {
		session: formatRatio(sessionRatio),
		last: formatRatio(lastRatio),
		cached: formatTokenCount(state.stats.cacheRead),
		uncached: formatTokenCount(state.stats.input),
	}) + (state.stats.cost ? ` · $${state.stats.cost.toFixed(6)}` : "");
}

function formatContextLine(state: RuntimeState): string {
	const pct = state.contextPct === undefined ? t(state.config, "status.unknown") : `${Math.round(state.contextPct * 100)}%`;
	const rec = recommendContextAction(state.contextPct, state.config);
	if (rec.level === "ok") return `${pct} ✓`;
	if (rec.level === "warn") return `${pct} ⚠ ${rec.message}`;
	if (rec.level === "danger") return `${pct} ⛔ ${rec.message}`;
	return pct;
}

function formatModelDetails(state: RuntimeState): string {
	const model = `${state.detection.provider ?? "unknown"}/${state.detection.modelId ?? "unknown"}`;
	const lines = [t(state.config, "status.model"), `  ${state.detection.ok ? "✓" : "⚠"} ${model}`];
	if (state.detection.kind === "not-deepseek") lines.push(`  ${t(state.config, "status.notDeepSeek")}`);
	else if (state.detection.kind === "misconfigured") lines.push(`  ${t(state.config, "status.misconfigured")}`);
	else lines.push(`  ${t(state.config, "status.compatOk")}`);
	if (state.detection.warnings.length) {
		lines.push(`  ${t(state.config, "status.warnings")}`);
		for (const warning of state.detection.warnings) lines.push(`  - ${warning}`);
	}
	return lines.join("\n");
}

function formatCacheDetails(state: RuntimeState): string {
	if (state.stats.requests === 0) return [t(state.config, "status.cache"), `  ${t(state.config, "status.noCompletedUsage")}`].join("\n");
	const sessionRatio = hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite);
	const lastRatio = state.stats.last ? hitRatio(state.stats.last.input, state.stats.last.cacheRead, state.stats.last.cacheWrite) : undefined;
	const requestWord = state.stats.requests === 1 ? t(state.config, "status.request.one") : t(state.config, "status.request.many");
	return [
		t(state.config, "status.cache"),
		`  ${t(state.config, "status.sessionHit", { ratio: formatRatio(sessionRatio), requests: state.stats.requests, requestWord })}`,
		`  ${t(state.config, "status.lastHit", { ratio: formatRatio(lastRatio) })}`,
		`  ${t(state.config, "status.cachedRead", { tokens: formatTokenCount(state.stats.cacheRead) })}`,
		`  ${t(state.config, "status.uncachedInput", { tokens: formatTokenCount(state.stats.input) })}`,
		`  ${t(state.config, "status.cacheWrites", { tokens: formatTokenCount(state.stats.cacheWrite) })}`,
		`  ${t(state.config, "status.output", { tokens: formatTokenCount(state.stats.output) })}`,
		`  ${t(state.config, "status.estimatedCost", { cost: state.stats.cost ? `$${state.stats.cost.toFixed(6)}` : t(state.config, "status.notReported") })}`,
		`  ${t(state.config, "status.requestsSinceCompaction", { requests: state.stats.sinceCompactionRequests })}`,
		`  ${t(state.config, "status.cacheSavings", { savings: state.stats.savings ? `$${state.stats.savings.toFixed(6)}` : t(state.config, "status.notReported") })}`,
	].join("\n");
}

function formatContextDetails(state: RuntimeState): string {
	const rec = recommendContextAction(state.contextPct, state.config);
	const pct = state.contextPct === undefined ? t(state.config, "status.unknown") : `${Math.round(state.contextPct * 100)}%`;
	return [t(state.config, "status.context"), `  ${t(state.config, "status.usage", { pct })}`, `  ${t(state.config, "status.recommendation", { message: rec.message })}`].join("\n");
}

function formatConfigDetails(pi: any, state: RuntimeState): string {
	return [
		t(state.config, "status.config"),
		`  ${t(state.config, "status.file", { path: getConfigPath() })}`,
		`  ${t(state.config, "status.extension", { state: state.config.enabled ? t(state.config, "status.enabled") : t(state.config, "status.disabled") })}`,
		`  ${t(state.config, "status.capper", { state: state.config.hugeResultCapper ? t(state.config, "status.enabled") : t(state.config, "status.disabled") })}`,
		`  ${t(state.config, "status.dynamicProvider", { state: state.config.registerDynamicProvider ? `${t(state.config, "status.enabled")} (${state.dynamicModels.length ? state.dynamicModels.join(", ") : t(state.config, "status.noModelsLoaded")})` : t(state.config, "status.disabled") })}`,
		`  Engine: prefix changes ${state.engine.prefixDriftCount} · history rewrites ${state.engine.historyRewriteCount} · ${formatDecision(state)}`,
		`  ${t(state.config, "status.hashLine", { prefixHash: state.engine.prefixHash?.slice(0, 12) ?? t(state.config, "status.unknown"), toolHash: state.engine.toolHash?.slice(0, 12) ?? t(state.config, "status.unknown"), tools: state.engine.toolHashChanges, reason: state.engine.lastPrefixChangeReason ?? t(state.config, "status.notReported") })}`,
		`  ${t(state.config, "status.prefixNotification", { turn: state.engine.lastPrefixWarningTurn ?? t(state.config, "status.notReported"), suppressed: state.engine.lastPrefixNotificationSuppressed ? t(state.config, "status.yes") : t(state.config, "status.no") })}`,
		`  ${t(state.config, "status.projectionLine", { active: state.engine.appendOnly.projectionActive ? t(state.config, "status.enabled") : t(state.config, "status.disabled"), tail: state.engine.appendOnly.tailStartEntryId ?? t(state.config, "status.notReported"), reason: state.engine.appendOnly.invalidatedReason ?? t(state.config, "status.notReported") })}`,
		`  ${formatEligibility(pi, state)}`,
		`  ${formatCompactionHistory(state)}`,
	].join("\n");
}

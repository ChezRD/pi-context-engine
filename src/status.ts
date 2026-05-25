import { isDeepSeekDetectionActive } from "./model.ts";
import { recommendContextAction } from "./context-monitor.ts";
import { detectPruner } from "./pruner-advisor.ts";
import { getConfigPath } from "./config.ts";
import { formatRatio, formatTokenCount, hitRatio, sessionHitRateAfterWarmup } from "./stats.ts";
import { buildContextStatus, decisionLabel } from "./cache-engine/index.ts";
import { buildProgressBar } from "./utils.ts";
import { formatPrefixReason } from "./prefix-reasons.ts";
import type { CacheDecisionAction } from "./cache-engine/decision-engine.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { STATUS_KEY } from "./runtime-state.ts";
import { t } from "./i18n/index.ts";
import { pruneAdjustedSavings, pruneNegativeImpactCost } from "./projection/prune-impact.ts";

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
	const hit = hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite) ?? 0;
	const bar = buildProgressBar(hit, 10, state.config.statusBarStyle as any);
	const hitText = formatRatio(hit);
	const turns = state.config.showTurnEstimate && status.zone !== "green" && status.turnsToOverflow !== undefined ? t(state.config, "status.turns", { turns: status.turnsToOverflow }) : "";
	const adjustedSavings = pruneAdjustedSavings(state);
	const savings = adjustedSavings < 0 ? `-$${Math.abs(adjustedSavings).toFixed(2)}` : `$${adjustedSavings.toFixed(2)}`;
	const reason = state.engine.lastPrefixChangeReason ? `:${formatPrefixReason(state.config, state.engine.lastPrefixChangeReason, "compact")}` : "";
	const prefix = state.engine.prefixDriftCount > 0 ? ` · ${t(state.config, "status.prefixDrift", { count: state.engine.prefixDriftCount })}${reason}` : "";
	const decision = status.decision === "hold" ? "" : ` · ${decisionLabel(status.decision)}`;
	const prune = formatPruneStatusBar(state);
	return t(state.config, "status.line", { bar: bar ? `${bar} ` : "", hit: hitText, savings, turns, prune, prefix, decision });
}

function pendingPruneToolCalls(state: RuntimeState): number {
	return state.engine.prune.pendingBatches.reduce((sum, batch) => sum + batch.toolCalls.length, 0);
}

function formatSavings(value: number): string {
	if (!Number.isFinite(value)) return "$0.000000";
	return value < 0 ? `-$${Math.abs(value).toFixed(6)}` : `$${value.toFixed(6)}`;
}

function formatPruneNext(state: RuntimeState): string {
	if (!state.config.pruneEnabled) return t(state.config, "status.pruneNext.off");
	const mode = state.config.pruneOn;
	if (mode === "every-turn") return t(state.config, "status.pruneNext.everyTurn");
	if (mode === "checkpoint") return t(state.config, "status.pruneNext.checkpoint");
	if (mode === "on-demand") return t(state.config, "status.pruneNext.manual");
	const target = Math.max(1, state.config.pruneBatchSize);
	const current = Math.min(state.engine.prune.batchStepCounter, target);
	if (mode === "agent-message" && state.engine.prune.awaitingAgentMessage && pendingPruneToolCalls(state) > 0) return t(state.config, "status.pruneNext.agentMessage");
	if (current >= target && pendingPruneToolCalls(state) > 0) return t(state.config, "status.pruneNext.now");
	const remaining = Math.max(0, target - current);
	return t(state.config, "status.pruneNext.turns", { turns: remaining });
}

function formatPruneStatusBar(state: RuntimeState): string {
	const done = state.engine.prune.pruneRunCount;
	const next = formatPruneNext(state);
	if (!state.config.pruneEnabled && done === 0) return "";
	return ` · ${t(state.config, "status.pruneLine", { done, next })}`;
}

export function buildStatus(pi: any, state: RuntimeState): string {
	return [
		t(state.config, "status.title"),
		`  ${t(state.config, "status.model")}: ${formatModelLine(state)}`,
		`  ${t(state.config, "status.cache")}: ${formatCacheLine(state)}`,
		`  ${t(state.config, "status.context")}: ${formatContextLine(state)}`,
		`  ${formatPruneDetails(state)}`,
		`  ${t(state.config, "status.checkpointLine", { checkpoints: state.engine.checkpoints.length, segments: state.engine.segments.length })}`,
		`  ${t(state.config, "status.pins", { count: state.pinStore.count, hash: state.pinStore.combinedHash.slice(0, 8) })}`,
		`  ${t(state.config, "status.engineLine", { prefixDrifts: state.engine.prefixDriftCount, rewrites: state.engine.historyRewriteCount, decision: formatDecision(state) })}`,
		`  ${t(state.config, "status.hashLine", { prefixHash: state.engine.prefixHash?.slice(0, 12) ?? t(state.config, "status.unknown"), toolHash: state.engine.toolHash?.slice(0, 12) ?? t(state.config, "status.unknown"), tools: state.engine.toolHashChanges, reason: state.engine.lastPrefixChangeReason ? formatPrefixReason(state.config, state.engine.lastPrefixChangeReason, "detail") : t(state.config, "status.notReported") })}`,
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
		formatCheckpointHistory(state),
		"",
		formatConfigDetails(pi, state),
	].join("\n");
}

export function formatPruneSummarizerTrace(state: RuntimeState): string {
	const impact = state.engine.prune.impact;
	if (!state.config.diagnostics || !impact?.lastSummarizePrompt) return `${t(state.config, "status.pruneTraceTitle")}\n  ${t(state.config, "status.notCaptured")}`;
	const accepted = impact.lastAcceptedSummaries?.length
		? impact.lastAcceptedSummaries.map((summary, index) => `  [${index + 1}] ${summary}`).join("\n")
		: `  ${t(state.config, "status.none")}`;
	return [
		t(state.config, "status.pruneTraceTitle"),
		`  ${t(state.config, "status.maxTokens")}: ${impact.lastSummarizeMaxTokens ?? t(state.config, "status.na")}`,
		`  ${t(state.config, "status.prompt")}:`,
		indentBlock(impact.lastSummarizePrompt, "    "),
		`  ${t(state.config, "status.rawResponse")}:`,
		indentBlock(impact.lastSummarizeResponse ?? t(state.config, "status.na"), "    "),
		`  ${t(state.config, "status.acceptedSummaries")}:`,
		accepted,
	].join("\n");
}

function indentBlock(text: string, indent: string): string {
	return text.split("\n").map((line) => indent + line).join("\n");
}

function formatCheckpointHistory(state: RuntimeState): string {
	const cps = state.engine.checkpoints;
	const segments = state.engine.segments;
	const lines = [t(state.config, "status.checkpointHistory")];
	if (!cps.length) {
		lines.push(`  ${t(state.config, "status.notReported")}`);
		return lines.join("\n");
	}
	for (let i = 0; i < cps.length; i++) {
		const cp = cps[i];
		const seg = segments.find((s) => s.checkpointId === cp.id);
		const label = cp.conversationLabel ? ` "${cp.conversationLabel}"` : "";
		const modelChange = cp.previousModelId && cp.modelId && cp.previousModelId !== cp.modelId ? ` ${cp.previousModelId} → ${cp.modelId}` : cp.modelId ? ` ${cp.modelId}` : "";
		const warmup = seg && seg.warmupRequests > 0 ? ` · ${t(state.config, "status.warmupRequests", { count: seg.warmupRequests })}` : "";
		lines.push(`  #${i + 1} ${cp.reason}${label} @${cp.turn}${modelChange}${warmup}`);
	}
	return lines.join("\n");
}

function formatCompactionHistory(state: RuntimeState): string {
	const records = state.stats.compacts ?? [];
	if (!records.length) return t(state.config, "status.compactionHistory", { history: t(state.config, "status.notReported") });
	const history = records.slice(-3).map((record) => `${record.reason}@${record.turn}:${record.completed ? t(state.config, "status.completed") : t(state.config, "status.failed")}`).join(", ");
	return t(state.config, "status.compactionHistory", { history });
}

function formatEligibility(pi: any, state: RuntimeState): string {
	const pruner = detectPruner(pi);
	const compactStorm = state.engine.compactCount > state.config.maxCompactsPerSession;
	const blockers: string[] = [];
	if (state.engine.prefixDriftCount > 0) blockers.push(t(state.config, "status.blockerPrefix", { count: state.engine.prefixDriftCount, reason: formatPrefixReason(state.config, state.engine.lastPrefixChangeReason, "compact") }));
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
	if (decision === "hold" || !decision) return "";
	return decisionLabel(decision as CacheDecisionAction);
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
		`  ${t(state.config, "status.cacheSavings", { savings: formatSavings(pruneAdjustedSavings(state)), gross: formatSavings(state.stats.savings), impact: formatSavings(pruneNegativeImpactCost(state)) })}`,
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
		`  ${formatPruneDetails(state)}`,
		`  ${t(state.config, "status.checkpointLine", { checkpoints: state.engine.checkpoints.length, segments: state.engine.segments.length })}`,
		`  ${t(state.config, "status.pins", { count: state.pinStore.count, hash: state.pinStore.combinedHash.slice(0, 8) })}`,
		`  ${t(state.config, "status.engineLine", { prefixDrifts: state.engine.prefixDriftCount, rewrites: state.engine.historyRewriteCount, decision: formatDecision(state) })}`,
		`  ${t(state.config, "status.hashLine", { prefixHash: state.engine.prefixHash?.slice(0, 12) ?? t(state.config, "status.unknown"), toolHash: state.engine.toolHash?.slice(0, 12) ?? t(state.config, "status.unknown"), tools: state.engine.toolHashChanges, reason: state.engine.lastPrefixChangeReason ? formatPrefixReason(state.config, state.engine.lastPrefixChangeReason, "detail") : t(state.config, "status.notReported") })}`,
		`  ${t(state.config, "status.prefixNotification", { turn: state.engine.lastPrefixWarningTurn ?? t(state.config, "status.notReported"), suppressed: state.engine.lastPrefixNotificationSuppressed ? t(state.config, "status.yes") : t(state.config, "status.no") })}`,
		`  ${t(state.config, "status.projectionLine", { active: state.engine.appendOnly.projectionActive ? t(state.config, "status.enabled") : t(state.config, "status.disabled"), tail: state.engine.appendOnly.tailStartEntryId ?? t(state.config, "status.notReported"), reason: state.engine.appendOnly.invalidatedReason ?? t(state.config, "status.notReported") })}`,
		`  ${formatEligibility(pi, state)}`,
		`  ${formatCompactionHistory(state)}`,
	].join("\n");
}

function formatPruneDetails(state: RuntimeState): string {
	const done = state.engine.prune.pruneRunCount;
	const summarized = state.engine.prune.summarizedIds.length;
	const applied = state.engine.prune.appliedIds.length;
	const unapplied = Math.max(0, summarized - applied);
	const pending = pendingPruneToolCalls(state);
	const batches = state.engine.prune.pendingBatches.length;
	const impact = state.engine.prune.impact;
	const target = Math.max(1, state.config.pruneBatchSize);
	const progress = state.config.pruneEnabled ? `${Math.min(state.engine.prune.batchStepCounter, target)}/${target}` : t(state.config, "status.pruneNext.off");
	const base = t(state.config, "status.pruneDetails", {
		mode: state.config.pruneOn,
		done,
		summarized,
		applied,
		unapplied,
		pending,
		batches,
		next: formatPruneNext(state),
		progress,
	});
	if (!impact) return base;
	const summary = t(state.config, "status.pruneSummaryImpact", {
		requests: impact.summarizeRequests,
		tokens: formatTokenCount(impact.summarizeInputTokens + impact.summarizeOutputTokens),
		cost: impact.summarizeCost.toFixed(4),
		last: (impact.lastSummarizeCost ?? 0).toFixed(4),
	});
	const slice = t(state.config, "status.pruneSliceImpact", {
		raw: formatTokenCount(impact.lastSummarizeRawChars ?? 0),
		summary: formatTokenCount(impact.lastSummarizeSummaryChars ?? 0),
		delta: formatTokenCount(Math.max(0, (impact.lastSummarizeRawChars ?? 0) - (impact.lastSummarizeSummaryChars ?? 0))),
		lastRaw: formatTokenCount(impact.lastSummarizeRawChars ?? 0),
		lastSummary: formatTokenCount(impact.lastSummarizeSummaryChars ?? 0),
	});
	const miss = t(state.config, "status.pruneMissImpact", {
		requests: impact.postPruneRequests,
		miss: formatTokenCount(impact.lastPostPruneMissTokens ?? 0),
		cache: formatTokenCount(impact.postPruneCacheReadTokens),
		cost: (impact.lastPostPruneMissCost ?? 0).toFixed(4),
		last: (impact.lastPostPruneMissCost ?? 0).toFixed(4),
		hit: impact.lastPostPruneHitRate === undefined ? "n/a" : formatRatio(impact.lastPostPruneHitRate),
	});
	const error = impact.lastError ? `\n  ${t(state.config, "status.pruneError", { error: impact.lastError })}` : "";
	return `${base}\n  ${summary}\n  ${slice}\n  ${miss}${error}`;
}

/**
 * /context TUI dashboard — detailed token usage + cache engine stats.
 * Ported from ttttmr/pi-context. Uses pi-tui overlay when available.
 */
import { formatTokens } from "../utils.ts";
import { t } from "../i18n/index.ts";
import { hitRatio, formatRatio, formatTokenCount, aggregateByModel, currentSegmentStats, warmHitRate } from "../stats.ts";
import { currentCacheSegment } from "../cache-engine/cache-checkpoints.ts";
import type { Component } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, Text, Spacer, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../runtime-state.ts";
import { pruneAdjustedSavings, pruneNegativeImpactCost } from "../projection/prune-impact.ts";

function padVisibleRight(str: string, width: number): string {
	return str + " ".repeat(Math.max(0, width - visibleWidth(str)));
}

function formatMoney(value: number, digits = 4): string {
	if (!Number.isFinite(value)) return "$0.0000";
	return value < 0 ? `-$${Math.abs(value).toFixed(digits)}` : `$${value.toFixed(digits)}`;
}

class BorderedContainer implements Component {
	private children: Component[] = [];
	private color: (str: string) => string;
	private scrollOffset = 0;
	private maxContentLines = 30;

	constructor(color: (str: string) => string) {
		this.color = color;
	}

	addChild(child: Component) {
		this.children.push(child);
	}

	scroll(delta: number) {
		this.scrollOffset = Math.max(0, this.scrollOffset + delta);
	}

	invalidate() {
		for (const child of this.children) {
			child.invalidate?.();
		}
	}

	render(width: number): string[] {
		const result: string[] = [];
		if (this.children.length === 0) return result;

		const frameWidth = Math.max(8, width);
		const contentWidth = Math.max(1, frameWidth - 4);
		const childLines: string[] = [];
		for (const child of this.children) {
			const lines = child.render(contentWidth);
			childLines.push(...lines);
		}
		const overflow = childLines.length > this.maxContentLines;
		const maxOffset = Math.max(0, childLines.length - this.maxContentLines);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const visibleLines = overflow ? childLines.slice(this.scrollOffset, this.scrollOffset + this.maxContentLines) : childLines;

		result.push(this.color("┌" + "─".repeat(frameWidth - 2) + "┐"));
		for (const line of visibleLines) {
			const fittedLine = visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth, "...") : line;
			const visibleLen = visibleWidth(fittedLine);
			const padding = Math.max(0, frameWidth - 4 - visibleLen);
			result.push(this.color("│ ") + fittedLine + " ".repeat(padding) + this.color(" │"));
		}
		if (overflow) {
			const info = `↑/↓ ${this.scrollOffset + 1}-${this.scrollOffset + visibleLines.length}/${childLines.length}`;
			const padding = Math.max(0, frameWidth - 4 - visibleWidth(info));
			result.push(this.color("│ ") + this.color(info) + " ".repeat(padding) + this.color(" │"));
		}
		result.push(this.color("└" + "─".repeat(frameWidth - 2) + "┘"));
		return result;
	}
}

function estimateTokens(text: string): number {
	return Math.ceil((text?.length ?? 0) / 4);
}

/**
 * Build token breakdown from branch data.
 */
async function getBreakdown(pi: any, ctx: any): Promise<{
	usage: any; systemTokens: number; toolDefTokens: number; msgTokens: number;
	toolUseTokens: number; toolResultTokens: number; totalActual: number;
	limit: number; usagePercent: number; categories: Array<{ key: string; label: string; value: number }>;
} | null> {
	const usage = await ctx.getContextUsage?.();
	if (usage?.tokens == null || usage?.contextWindow == null) return null;

	const sm = ctx.sessionManager;
	const branch = sm?.getBranch?.() ?? [];
	const systemPrompt = ctx.getSystemPrompt?.() ?? "";
	const tools = pi.getActiveTools?.() ?? [];
	const allTools = pi.getAllTools?.() ?? [];
	const activeToolDefs = allTools.filter((t: any) => tools.includes(t.name));

	let msgTokensRaw = 0, toolUseTokensRaw = 0, toolResultTokensRaw = 0;

	for (const entry of branch) {
		if (entry.type !== "message") {
			if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.summary) msgTokensRaw += estimateTokens(entry.summary);
			continue;
		}
		const m = entry.message;
		if (!m) continue;
		if (m.role === "user") {
			if (typeof m.content === "string") msgTokensRaw += estimateTokens(m.content);
			else if (Array.isArray(m.content)) for (const p of m.content) if (p.type === "text") msgTokensRaw += estimateTokens(p.text);
		} else if (m.role === "assistant") {
			if (typeof m.content === "string") msgTokensRaw += estimateTokens(m.content);
			else if (Array.isArray(m.content)) for (const p of m.content) {
				if (p.type === "text") msgTokensRaw += estimateTokens(p.text);
				if (p.type === "toolCall") toolUseTokensRaw += estimateTokens(JSON.stringify(p));
			}
		} else if (m.role === "tool" || m.role === "toolResult") {
			if (Array.isArray(m.content)) for (const p of m.content) if (p.type === "text") toolResultTokensRaw += estimateTokens(p.text);
		} else if (m.role === "bash" || m.role === "bashExecution") {
			toolUseTokensRaw += estimateTokens(m.command ?? "");
		}
	}

	const systemTokensRaw = estimateTokens(systemPrompt);
	const toolDefTokensRaw = estimateTokens(JSON.stringify(activeToolDefs));
	const totalRaw = systemTokensRaw + toolDefTokensRaw + msgTokensRaw + toolUseTokensRaw + toolResultTokensRaw;
	const ratio = totalRaw > 0 ? (usage.tokens / totalRaw) : 1;

	const systemTokens = Math.round(systemTokensRaw * ratio);
	const toolDefTokens = Math.round(toolDefTokensRaw * ratio);
	const msgTokens = Math.round(msgTokensRaw * ratio);
	const toolUseTokens = Math.round(toolUseTokensRaw * ratio);
	const toolResultTokens = Math.round(toolResultTokensRaw * ratio);
	const otherTokens = Math.max(0, usage.tokens - (systemTokens + toolDefTokens + msgTokens + toolUseTokens + toolResultTokens));

	const categories: Array<{ key: string; label: string; value: number }> = [
		{ key: "system", label: t("ui.dashboard.system"), value: systemTokens },
		{ key: "tools", label: t("ui.dashboard.tools"), value: toolDefTokens },
		{ key: "toolCalls", label: t("ui.dashboard.toolCalls"), value: toolUseTokens + toolResultTokens },
		{ key: "messages", label: t("ui.dashboard.messages"), value: msgTokens },
	];
	if (otherTokens > 10) categories.push({ key: "other", label: t("ui.dashboard.other"), value: otherTokens });

	return { usage, systemTokens, toolDefTokens, msgTokens, toolUseTokens, toolResultTokens, totalActual: usage.tokens, limit: usage.contextWindow, usagePercent: usage.percent, categories };
}

// ── Cache stats section ──

function buildCacheLines(state: RuntimeState | undefined, theme: any): string[] {
	if (!state) return [];
	const lines: string[] = [];
	const cfg = state.config;

	lines.push(theme.fg("borderMuted", "─".repeat(40)));
	lines.push(theme.fg("accent", theme.bold(t(cfg, "ui.dashboard.cacheStatsTitle"))));
	lines.push("");

	if (state.stats.requests > 0) {
		const sessionRatio = hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite);
		const lastRatio = state.stats.last ? hitRatio(state.stats.last.input, state.stats.last.cacheRead, state.stats.last.cacheWrite) : undefined;
		const sessionMissRatio = sessionRatio === undefined ? undefined : 1 - sessionRatio;
		const hitBar = buildHitMissBar(sessionRatio ?? 0, 14, theme);
		const lastColor = lastRatio === undefined ? "dim" : lastRatio >= 0.9 ? "success" : lastRatio >= 0.5 ? "warning" : "error";
		lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.hitRate"))}  ${hitBar} ${theme.fg("success", `${t(cfg, "ui.dashboard.hitShort")} ${formatRatio(sessionRatio)}`)} ${theme.fg("warning", `· ${t(cfg, "ui.dashboard.missShort")} ${formatRatio(sessionMissRatio)}`)} ${theme.fg("dim", `· ${t(cfg, "ui.dashboard.lastShort")} `)}${theme.fg(lastColor, formatRatio(lastRatio))}`);
		lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.tokens"))}  ${theme.fg("success", `${t(cfg, "ui.dashboard.cached")} ${formatTokenCount(state.stats.cacheRead)}`)} ${theme.fg("warning", `· ${t(cfg, "ui.dashboard.uncached")} ${formatTokenCount(state.stats.input)}`)} ${theme.fg("dim", `· ${t(cfg, "ui.dashboard.outputShort")} ${formatTokenCount(state.stats.output)}`)}`);

		const snapNoCacheCost = (state.stats.usages ?? []).reduce((sum, usage) => sum + (usage.noCacheCost ?? 0), 0);
		const snapActualCost = (state.stats.usages ?? []).reduce((sum, usage) => sum + (usage.actualCost ?? usage.cost ?? 0), 0);
		const snapSavings = (state.stats.usages ?? []).reduce((sum, usage) => sum + (usage.savings ?? 0), 0);
		const pruneSummaryCost = state.engine.prune.impact?.summarizeCost ?? 0;
		const pruneImpactCost = pruneNegativeImpactCost(state);
		const netSavings = pruneAdjustedSavings(state);
		const actualWithPruneStr = snapActualCost + pruneSummaryCost > 0 ? `$${(snapActualCost + pruneSummaryCost).toFixed(4)}` : "$0.00";
		const noCacheStr = snapNoCacheCost > 0 ? `$${snapNoCacheCost.toFixed(4)}` : "n/a";
		const netSavingsStr = formatMoney(netSavings);
		const netColor = netSavings >= 0 ? "success" : "error";
		lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.cost"))}  ${theme.fg("text", `${t(cfg, "ui.dashboard.actualCost")} ${actualWithPruneStr}`)} ${theme.fg("warning", `· ${t(cfg, "ui.dashboard.noCacheCost")} ${noCacheStr}`)} ${theme.fg(netColor, `· ${t(cfg, "ui.dashboard.cacheSaved")} ${netSavingsStr}`)}`);
		if (pruneImpactCost > 0) {
			lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.netSavingsHelp", { gross: formatMoney(snapSavings), impact: formatMoney(pruneImpactCost) })}`));
		}
		lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.cacheDeltaHelp")} · ${state.stats.requests} ${t(cfg, "ui.dashboard.reqs")}`));

		const seg = currentCacheSegment(state);
		const segIdx = state.engine.segments.indexOf(seg);
		const segNum = segIdx >= 0 ? segIdx + 1 : state.engine.segments.length;
		const segCp = state.engine.checkpoints.find((item) => item.id === seg.checkpointId);
		const segReq = (state.stats.usages ?? []).filter((u) => u.segmentId === seg.id).length;
		const segReason = segCp?.reason ?? "session_start";
		const segStats = currentSegmentStats(state);
		const segRatio = segStats.requests > 0 ? hitRatio(segStats.input, segStats.cacheRead, segStats.cacheWrite) : undefined;
		const warmUsages = (state.stats.usages ?? []).filter((u) => u.segmentId === seg.id);
		const warmRate = warmHitRate(warmUsages);
		const warmColor = warmRate === undefined ? "dim" : warmRate >= 0.9 ? "success" : warmRate >= 0.5 ? "warning" : "error";
		const segParts = [
			`#${segNum}`,
			segReason,
			`${segReq} ${t(cfg, "ui.dashboard.reqs")}`,
			`${t(cfg, "ui.dashboard.hitShort")} ${formatRatio(segRatio)}`,
		];
		lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.currentSegmentLabel"))}  ${theme.fg("text", segParts.join(" · "))} ${theme.fg(warmColor, `· ${t(cfg, "ui.dashboard.warmHitShort")} ${formatRatio(warmRate)}`)}`);
		lines.push(...buildPruneLines(state, theme));

		const models = aggregateByModel(state.stats.usages ?? []);
		if (models.length > 0) {
			lines.push("");
			lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.modelsLabel"))}`);
			for (const model of models) {
				const hitText = model.hitRate !== undefined ? formatRatio(model.hitRate) : "n/a";
				const costText = model.actualCost > 0 ? `$${model.actualCost.toFixed(4)}` : "$0";
				const saveText = model.savings !== undefined && model.savings > 0 ? `$${model.savings.toFixed(2)}` : model.pricingKnown ? "$0" : "n/a";
				const noCacheText = model.noCacheCost !== undefined && model.noCacheCost > 0 ? `$${model.noCacheCost.toFixed(4)}` : model.pricingKnown ? "$0" : "n/a";
				const modelColor = model.pricingKnown ? "text" : "dim";
				lines.push(theme.fg(modelColor, `  ${model.modelId}`));
				lines.push(`    ${theme.fg("dim", `${t(cfg, "ui.dashboard.tokensShort")} ${formatTokenCount(model.input)} · ${t(cfg, "ui.dashboard.cachedShort")} ${formatTokenCount(model.cacheRead)} · ${t(cfg, "ui.dashboard.outputShort")} ${formatTokenCount(model.output)} · ${t(cfg, "ui.dashboard.hitShort")} ${hitText}`)}`);
				lines.push(`    ${theme.fg("text", `${t(cfg, "ui.dashboard.actualCost")} ${costText}`)} ${theme.fg("warning", `· ${t(cfg, "ui.dashboard.noCacheCost")} ${noCacheText}`)} ${theme.fg("success", `· ${t(cfg, "ui.dashboard.cacheSaved")} ${saveText}`)}`);
			}
		}

		const totalCheckpoints = state.engine.checkpoints.length;
		if (models.length > 1 || totalCheckpoints > 1) {
			lines.push("");
			lines.push(`${theme.fg("warning", t(cfg, "ui.dashboard.mixedSession", { models: models.length, checkpoints: totalCheckpoints }))}`);
		}
	} else {
		lines.push(`${theme.fg("dim", t(cfg, "ui.dashboard.noUsageYet"))}`);
	}

	const prefixOk = state.engine.prefixDriftCount === 0;
	const toolsOk = state.engine.toolHashChanges === 0;
	if (!prefixOk || !toolsOk || state.engine.historyRewriteCount > 0) {
		lines.push("");
		const issues = [
			!prefixOk ? `${t(cfg, "ui.dashboard.prefix")} Δ${state.engine.prefixDriftCount}` : "",
			!toolsOk ? `${t(cfg, "ui.dashboard.toolsLabel")} Δ${state.engine.toolHashChanges}` : "",
			state.engine.historyRewriteCount > 0 ? `${t(cfg, "ui.dashboard.rewrites")} ${state.engine.historyRewriteCount}` : "",
		].filter(Boolean).join(" · ");
		lines.push(`${theme.fg("warning", t(cfg, "ui.dashboard.cacheRisk"))}  ${theme.fg("warning", issues)}`);
		if (!prefixOk) lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.prefixChangedHelp")}`));
		if (!toolsOk) lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.toolsChangedHelp")}`));
	}

	// Pins row
	if (state.pinStore.count > 0) {
		lines.push("");
		lines.push(`${theme.fg("muted", t(cfg, "ui.dashboard.pins"))}  ${theme.fg("text", `${state.pinStore.count} · ${t(cfg, "ui.dashboard.pinHash")} ${state.pinStore.combinedHash.slice(0, 8)}`)}`);
	}

	return lines;
}

function pendingPruneToolCalls(state: RuntimeState): number {
	return state.engine.prune.pendingBatches.reduce((sum, batch) => sum + batch.toolCalls.length, 0);
}

function pruneNextLabel(state: RuntimeState): string {
	const cfg = state.config;
	if (!cfg.pruneEnabled) return t(cfg, "status.pruneNext.off");
	if (cfg.pruneOn === "every-turn") return pendingPruneToolCalls(state) > 0 ? t(cfg, "status.pruneNext.now") : t(cfg, "status.pruneNext.toolBatch");
	if (cfg.pruneOn === "checkpoint") return t(cfg, "status.pruneNext.checkpoint");
	if (cfg.pruneOn === "on-demand") return t(cfg, "status.pruneNext.manual");
	const target = Math.max(1, cfg.pruneBatchSize);
	const current = Math.min(state.engine.prune.batchStepCounter, target);
	return current >= target ? t(cfg, "status.pruneNext.now") : `${current}/${target}`;
}

function buildPruneLines(state: RuntimeState, theme: any): string[] {
	const cfg = state.config;
	const done = state.engine.prune.pruneRunCount;
	const summarized = state.engine.prune.summarizedIds.length;
	const applied = state.engine.prune.appliedIds.length;
	const unapplied = Math.max(0, summarized - applied);
	const pending = pendingPruneToolCalls(state);
	const batches = state.engine.prune.pendingBatches.length;
	const impact = state.engine.prune.impact;
	const target = Math.max(1, cfg.pruneBatchSize);
	const progress = cfg.pruneEnabled ? `${Math.min(state.engine.prune.batchStepCounter, target)}/${target}` : t(cfg, "status.pruneNext.off");
	const lines = [
		`${theme.fg("muted", t(cfg, "ui.dashboard.pruneLabel"))}  ${theme.fg("text", `${t(cfg, "ui.dashboard.pruneMode")} ${cfg.pruneOn}`)} ${theme.fg("success", `· ${t(cfg, "ui.dashboard.pruneDone")} ${done}`)} ${theme.fg("dim", `· ${t(cfg, "ui.dashboard.pruneSummarized")} ${summarized}`)} ${theme.fg("warning", `· ${t(cfg, "ui.dashboard.prunePending")} ${pending}/${batches}`)} ${theme.fg("accent", `· ${t(cfg, "ui.dashboard.pruneNext")} ${pruneNextLabel(state)}`)}`,
		theme.fg("dim", `  ${t(cfg, "ui.dashboard.pruneProgress", { progress, target })} · ${t(cfg, "ui.dashboard.pruneApplied", { applied, summarized, unapplied })}`),
	];
	if (impact) {
		const summaryCost = `$${impact.summarizeCost.toFixed(4)}`;
		const lastSummaryCost = `$${(impact.lastSummarizeCost ?? 0).toFixed(4)}`;
		const missCost = `$${impact.postPruneMissCost.toFixed(4)}`;
		const lastMissCost = `$${(impact.lastPostPruneMissCost ?? 0).toFixed(4)}`;
		const lastHit = impact.lastPostPruneHitRate === undefined ? "n/a" : formatRatio(impact.lastPostPruneHitRate);
		const rawChars = formatTokenCount(impact.summarizeRawChars ?? 0);
		const summaryChars = formatTokenCount(impact.summarizeSummaryChars ?? 0);
		const lastRawChars = formatTokenCount(impact.lastSummarizeRawChars ?? 0);
		const lastSummaryChars = formatTokenCount(impact.lastSummarizeSummaryChars ?? 0);
		const deltaChars = formatTokenCount(Math.max(0, (impact.summarizeRawChars ?? 0) - (impact.summarizeSummaryChars ?? 0)));
		lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.pruneSummaryImpact", { requests: impact.summarizeRequests, tokens: formatTokenCount(impact.summarizeInputTokens + impact.summarizeOutputTokens), cost: summaryCost, last: lastSummaryCost })}`));
		lines.push(theme.fg("success", `  ${t(cfg, "ui.dashboard.pruneSliceImpact", { raw: rawChars, summary: summaryChars, delta: deltaChars, lastRaw: lastRawChars, lastSummary: lastSummaryChars })}`));
		lines.push(theme.fg("dim", `  ${t(cfg, "ui.dashboard.pruneMissImpact", { requests: impact.postPruneRequests, miss: formatTokenCount(impact.postPruneMissTokens), cache: formatTokenCount(impact.postPruneCacheReadTokens), cost: missCost, last: lastMissCost, hit: lastHit })}`));
		if (impact.lastError) {
			lines.push(theme.fg("warning", `  ${t(cfg, "ui.dashboard.pruneError", { error: impact.lastError })}`));
		}
	}
	return lines;
}

function buildModelLine(state: RuntimeState | undefined, theme: any): string | undefined {
	if (!state) return undefined;
	const modelId = state.detection.modelId ?? "unknown";
	const provider = state.detection.provider ?? "unknown";
	return `${theme.fg("muted", t(state.config, "ui.dashboard.modelLabel"))}  ${theme.fg("text", `${provider}/${modelId}`)}`;
}

function buildHitMissBar(ratio: number, width: number, theme: any): string {
	const filled = Math.round(ratio * width);
	const empty = width - filled;
	return theme.fg("success", "█".repeat(filled)) + theme.fg("warning", "░".repeat(empty));
}

function allocateSlots(
	items: Array<{ value: number }>,
	total: number,
	width: number,
): number[] {
	if (total <= 0 || width <= 0) return items.map(() => 0);

	const raw = items.map((item) => Math.max(0, item.value) / total * width);
	const minimums = items.map((item) => item.value > 0 ? 1 : 0);
	const slots = raw.map((value, index) => Math.max(minimums[index], Math.floor(value)));
	let used = slots.reduce((sum, value) => sum + value, 0);

	if (used > width) {
		const order = items.map((item, index) => ({ index, value: item.value })).sort((a, b) => a.value - b.value);
		while (used > width) {
			const next = order.find((item) => slots[item.index] > 0 && slots[item.index] > minimums[item.index])
				?? order.find((item) => slots[item.index] > 0);
			if (!next) break;
			slots[next.index] -= 1;
			used -= 1;
		}
		return slots;
	}

	const remainders = raw.map((value, index) => ({ index, value: value - Math.floor(value) })).sort((a, b) => b.value - a.value);
	let cursor = 0;
	while (used < width && remainders.length > 0) {
		const item = remainders[cursor % remainders.length];
		slots[item.index] += 1;
		used += 1;
		cursor += 1;
	}

	return slots;
}

function buildSegmentedContextGraph(
	categories: Array<{ key: string; label: string; value: number; color: string }>,
	limit: number,
	theme: any,
	cfg: any,
): string[] {
	const width = 48;
	const slots = allocateSlots(categories, limit, width);
	const bar = categories.map((cat, index) => {
		const char = cat.key === "available" ? "·" : "━";
		return theme.fg(cat.color as any, char.repeat(slots[index]));
	}).join("");

	const used = categories.filter((cat) => cat.key !== "available").reduce((sum, cat) => sum + cat.value, 0);
	const available = Math.max(0, limit - used);
	return [
		`${theme.fg("dim", "0%")} ${theme.fg("borderMuted", "│")}${bar}${theme.fg("borderMuted", "│")} ${theme.fg("dim", "100%")}`,
		`${theme.fg("text", formatTokens(used))} ${theme.fg("dim", t(cfg, "ui.dashboard.usedShort"))} ${theme.fg("borderMuted", "•")} ${theme.fg("borderMuted", formatTokens(available))} ${theme.fg("dim", t(cfg, "ui.dashboard.freeShort"))}`,
	];
}

function buildContextUsageTable(
	categories: Array<{ key: string; label: string; value: number; color: string }>,
	totalActual: number,
	limit: number,
	usagePercent: number,
	theme: any,
	cfg: any,
): string[] {
	const rows = [
		{
			color: "text",
			icon: " ",
			label: t(cfg, "ui.dashboard.total"),
			value: totalActual,
			percent: usagePercent,
			bold: true,
		},
		...categories.map((cat) => ({
			color: cat.color,
			icon: cat.key === "available" ? "·" : "▌",
			label: cat.label,
			value: cat.value,
			percent: (cat.value / limit) * 100,
			bold: false,
		})),
	];
	const labelWidth = 22;
	const valueWidth = 8;
	return rows.map((row) => {
		const icon = row.icon === " " ? " " : theme.fg(row.color as any, row.icon);
		const label = padVisibleRight(theme.fg("text", row.bold ? theme.bold(row.label) : row.label), labelWidth);
		const value = padVisibleRight(theme.fg("accent", row.bold ? theme.bold(formatTokens(row.value)) : formatTokens(row.value)), valueWidth);
		const percent = theme.fg("text", `(${row.percent.toFixed(1).padStart(5)}%)`);
		return `    ${icon} ${label} ${value} ${percent}`;
	});
}

// ── TUI Component ──

export async function showDashboard(pi: any, ctx: any, state?: RuntimeState): Promise<void> {
	const usage = await ctx.getContextUsage?.();
	if (!usage) {
		ctx.ui?.notify?.(t("ui.dashboard.unavailable"), "warning");
		return;
	}

	// Try TUI overlay first
	if (typeof ctx.ui?.custom === "function") {
		const data = await getBreakdown(pi, ctx);
		if (!data) return;
		
		await ctx.ui.custom((_tui: any, theme: any, _kb: any, done: (result?: any) => void) => {
			const container = new Container();
			container.addChild(new Text(theme.fg("accent", theme.bold(t("ui.dashboard.title"))), 1, 0));
			container.addChild(new Spacer(1));

			const categoriesInfo = data.categories.map((cat) => {
				let color = "accent";
				if (cat.key === "system") color = "muted";
				else if (cat.key === "tools") color = "dim";
				else if (cat.key === "toolCalls") color = "success";
				else if (cat.key === "other") color = "dim";
				return { key: cat.key, label: cat.label, value: cat.value, color };
			});

			categoriesInfo.push({ key: "available", label: t("ui.dashboard.available"), value: Math.max(0, data.limit - data.totalActual), color: "borderMuted" });

			const graphLines = buildSegmentedContextGraph(categoriesInfo, data.limit, theme, state?.config);
			const modelLine = buildModelLine(state, theme);

			const usagePercent = data.usagePercent;
			if (modelLine) {
				container.addChild(new Text(`    ${modelLine}`, 1, 0));
				container.addChild(new Spacer(1));
			}
			for (const line of graphLines) {
				container.addChild(new Text(`    ${line}`, 1, 0));
			}
			container.addChild(new Spacer(1));
			for (const line of buildContextUsageTable(categoriesInfo, data.totalActual, data.limit, usagePercent, theme, state?.config)) {
				container.addChild(new Text(line, 1, 0));
			}

			// Add cache engine stats section
			const cacheLines = buildCacheLines(state, theme);
			if (cacheLines.length > 0) {
				container.addChild(new Spacer(1));
				const cacheStatsTitle = state ? t(state.config, "ui.dashboard.cacheStatsTitle") : "";
				for (const line of cacheLines) {
					const prefix = cacheStatsTitle && line.includes(cacheStatsTitle) ? "" : "  ";
					const leftPadding = cacheStatsTitle && line.includes(cacheStatsTitle) ? 1 : 0;
					container.addChild(new Text(`${prefix}${line}`, leftPadding, 0));
				}
			}

			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", t("ui.dashboard.closeHint")), 1, 0));

			const wrapper = new BorderedContainer((s: string) => theme.fg("accent", s));
			wrapper.addChild(container);

			return {
				render: (w: number) => wrapper.render(w),
				invalidate: () => wrapper.invalidate(),
				handleInput: (input: string) => {
					if (matchesKey(input, Key.up)) {
						wrapper.scroll(-1);
						wrapper.invalidate();
						return true;
					}
					if (matchesKey(input, Key.down)) {
						wrapper.scroll(1);
						wrapper.invalidate();
						return true;
					}
					if (matchesKey(input, Key.pageUp)) {
						wrapper.scroll(-10);
						wrapper.invalidate();
						return true;
					}
					if (matchesKey(input, Key.pageDown)) {
						wrapper.scroll(10);
						wrapper.invalidate();
						return true;
					}
					done(undefined);
					return true;
				},
			};
		}, {
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				offsetY: -3,
				width: "92%",
				minWidth: 70,
				maxHeight: "82%",
				margin: { top: 2, right: 2, bottom: 1, left: 2 },
			},
		});
		return;
	}

	// Fallback: flat text notification
	const data = await getBreakdown(pi, ctx);
	if (!data) { ctx.ui?.notify?.(t("ui.dashboard.unavailable"), "warning"); return; }
	const { totalActual, limit, usagePercent, categories } = data;
	const lines: string[] = [`── ${t("ui.dashboard.title").trim()} ──`];
	lines.push(`  ${t("ui.dashboard.total")}: ${formatTokens(totalActual)} (${usagePercent.toFixed(1)}%)`);
	for (const cat of categories) {
		const pct = ((cat.value / limit) * 100).toFixed(1);
		lines.push(`  ${cat.label.padEnd(14)} ${formatTokens(cat.value).padStart(7)} (${pct}%)`);
	}
	const avail = Math.max(0, limit - totalActual);
	lines.push(`  ${t("ui.dashboard.available").padEnd(14)} ${formatTokens(avail).padStart(7)} (${((avail / limit) * 100).toFixed(1)}%)`);

	// Add cache summary in fallback
	if (state && state.stats.requests > 0) {
		const sessionRatio = hitRatio(state.stats.input, state.stats.cacheRead, state.stats.cacheWrite);
		const savingsStr = state.stats.savings > 0 ? `$${state.stats.savings.toFixed(4)}` : "$0.00";
		lines.push("");
		lines.push(`  ${t(state.config, "ui.dashboard.hitRate")}: ${formatRatio(sessionRatio)} · ${t(state.config, "ui.dashboard.economy")}: ${savingsStr}`);
	}

	ctx.ui?.notify?.(lines.join("\n"), "info");
}

export function registerDashboardCommand(input: any): void {
	const pi = input?.pi ?? input;
	const getState: (() => RuntimeState) | undefined = input?.getState;
	pi.registerCommand?.("context", {
		description: t("ui.dashboard.description"),
		handler: async (_args: string, ctx: any) => {
			await showDashboard(pi, ctx, getState?.());
		},
	});
}

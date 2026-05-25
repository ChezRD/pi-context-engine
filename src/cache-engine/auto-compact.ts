import type { RuntimeState } from "../runtime-state.ts";
import { costToCompact, deepSeekOfficialCost, formatRatio } from "../stats.ts";
import { buildContextStatus, canCompactNow, decideAfterUsage } from "./decision-engine.ts";
import { compactOptions } from "./custom-compaction.ts";
import { activateAppendOnlyProjectionFromCompact } from "./append-only-projection.ts";
import { markCompaction } from "../stats.ts";
import { t } from "../i18n/index.ts";
import { openCacheCheckpoint } from "./cache-checkpoints.ts";
import { semanticFold, clearFold } from "../projection/history-folder.ts";
import { captureBatches, captureTurnEndBatch, hasAssistantToolCalls, shouldTriggerPrune } from "../projection/batch-capture.ts";
import { recordPruneSummarizeImpact } from "../projection/prune-impact.ts";
import { appendPruneDebugEntry, persistTelemetry } from "../telemetry-persistence.ts";
import { isReplacementSummaryEfficient } from "../projection/tool-pruner.ts";

function notify(ctx: any, text: string, level: "info" | "warning" | "error" = "warning"): void {
	ctx?.ui?.notify?.(text, level);
}

/**
 * Try semantic fold first. On failure, fallback to ctx.compact().
 */
export async function requestFold(pi: any, ctx: any, state: RuntimeState, opts?: { aggressive?: boolean; reason?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
	// Try semantic fold first
	const semResult = await semanticFold(pi, ctx, state, opts);
	if (semResult.ok) {
		openCacheCheckpoint(state, "semantic_fold", { startSegment: true });
		state.engine.lastCompactTurn = state.engine.turnIndex;
		state.engine.compactCount++;
		return { ok: true };
	}

	// Fallback to native ctx.compact()
	if (typeof ctx?.compact !== "function") return { ok: false, error: t("engine.compactUnavailable") };

	// Wrap compact in a Promise with timeout so it doesn't hang if onComplete isn't called
	const compactResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
		const timer = setTimeout(() => {
			resolve({ ok: false, error: "compact timeout" });
		}, 500);
		try {
			const raw = ctx.compact({
				...compactOptions({ ...state.config, autoFold: true }, ctx),
				onComplete: (result: any) => {
					clearTimeout(timer);
					state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "auto", completed: true });
					activateAppendOnlyProjectionFromCompact(result, state);
					clearFold(state);
					resolve({ ok: true });
				},
				onError: (error: Error) => {
					clearTimeout(timer);
					state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "auto", completed: false, error: error.message });
					resolve({ ok: false, error: error.message });
				},
			});
			// If ctx.compact returns a promise directly, handle that
			if (raw && typeof raw.then === "function") {
				raw.then(
					() => { clearTimeout(timer); resolve({ ok: true }); },
					(err: any) => { clearTimeout(timer); resolve({ ok: false, error: err?.message ?? String(err) }); },
				);
			}
		} catch (error) {
			clearTimeout(timer);
			resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
		}
	});

	state.engine.lastCompactTurn = state.engine.turnIndex;
	state.engine.compactCount++;
	if (!compactResult.ok) {
		return { ok: false, error: compactResult.error ?? "unknown" };
	}
	return { ok: true };
}

export function requestCompact(ctx: any, state: RuntimeState): { ok: true } | { ok: false; error: string } {
	if (typeof ctx?.compact !== "function") return { ok: false, error: t("engine.compactUnavailable") };
	try {
		ctx.compact({
			onComplete: (result: any) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "manual", completed: true });
				activateAppendOnlyProjectionFromCompact(result, state);
				notify(ctx, t("engine.compactComplete"), "info");
			},
			onError: (error: Error) => {
				state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "manual", completed: false, error: error.message });
				notify(ctx, t("engine.compactFailed", { error: error.message }), "error");
			},
		});
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	state.engine.lastCompactTurn = state.engine.turnIndex;
	state.engine.compactCount++;
	return { ok: true };
}

export function holdCompaction(state: RuntimeState, turns = state.config.minTurnsBetweenCompacts): void {
	state.engine.holdUntilTurn = state.engine.turnIndex + Math.max(1, turns);
	state.engine.lastDecision = "hold";
}

function estimateCompactMissCost(state: RuntimeState): number {
	const usage = state.stats.last ?? { input: state.stats.input, cacheRead: state.stats.cacheRead, cacheWrite: state.stats.cacheWrite };
	return costToCompact(usage, deepSeekOfficialCost(state.detection.modelId));
}

function choiceText(state: RuntimeState, status: ReturnType<typeof buildContextStatus>): string {
	const pct = status.ratio === undefined ? t("status.unknown") : `${Math.round(status.ratio * 100)}%`;
	const hit = formatRatio(status.hitRate);
	const turns = status.turnsToOverflow === undefined ? t("status.unknown") : `~${status.turnsToOverflow}`;
	return t("engine.notify.choice", { pct, hit, turns, saved: state.stats.savings.toFixed(4), compact: estimateCompactMissCost(state).toFixed(4) });
}

export async function handleTurnEnd(pi: any, ctx: any, state: RuntimeState, event?: any): Promise<void> {
	if (!state.config.enabled) return;
	
	// Reset foldedThisTurn flag for new turn
	state.engine.semanticFold.foldedThisTurn = false;

	await runAutoPrune(pi, ctx, state, event);
	
	const status = buildContextStatus(ctx, state.stats, state.config);
	state.engine.lastZone = status.zone;
	state.engine.lastDecision = status.decision;

	// Post-usage decision: exit-with-summary
	const promptTokens = status.tokens;
	const ctxMax = status.max;
	if (promptTokens !== undefined && ctxMax !== undefined) {
		const postDecision = decideAfterUsage(promptTokens, ctxMax, state.engine.semanticFold.foldedThisTurn, state.config);
		if (postDecision.kind === "exit-with-summary") {
			notify(ctx, t("engine.foldExitSummary"), "warning");
			await requestFold(pi, ctx, state, { aggressive: true, reason: "exit-summary" });
			// Abort current turn loop — force the agent to start fresh with summary context
			ctx.abort?.();
			return;
		}
	}

	if (state.engine.holdUntilTurn !== undefined && state.engine.turnIndex < state.engine.holdUntilTurn && status.decision !== "force_fold") return;
	if (state.config.autoFold && (status.decision === "fold" || status.decision === "force_fold") && canCompactNow(state)) {
		await requestFold(pi, ctx, state, { aggressive: status.decision === "force_fold" });
		return;
	}
	if (status.zone === "orange" || status.zone === "red" || status.zone === "critical") notify(ctx, choiceText(state, status), "warning");
}

async function runAutoPrune(pi: any, ctx: any, state: RuntimeState, event?: any): Promise<void> {
	// Pillar 1.1: Batch capture + auto-pruning
	if (state.config.pruneEnabled) {
		try {
			const skipIds = [...state.engine.prune.summarizedIds, ...(state.engine.prune.skippedOversizedIds ?? [])];
			const capturedFromTurnEnd = captureTurnEndBatch(event, skipIds, state.engine.prune, state.engine.turnIndex);
			const branch = await ctx?.sessionManager?.getBranch?.();
			let lastAssistant = event?.message?.role === "assistant" ? event.message : undefined;
			if (branch) {
				captureBatches(branch, skipIds, state.engine.prune, state.engine.turnIndex, { bridgeLength: state.config.pruneBridgeLength });
				lastAssistant = [...branch].reverse().map((entry: any) => entry.message).find((msg: any) => msg?.role === "assistant") ?? lastAssistant;
			}

			const hadTools = capturedFromTurnEnd > 0 || Boolean(lastAssistant && hasAssistantToolCalls(lastAssistant));
			if (hadTools) state.engine.prune.batchStepCounter++;
			const hasPendingTools = state.engine.prune.pendingBatches.some((batch) => batch.toolCalls.length > 0);
			const lastAssistantPureText = Boolean(lastAssistant && !hasAssistantToolCalls(lastAssistant));
			const rawCheckpointTriggered = Boolean(state.engine.prune.checkpointTriggered);
			const checkpointTriggered = state.config.pruneOn === "checkpoint" && rawCheckpointTriggered;
			if (rawCheckpointTriggered) state.engine.prune.checkpointTriggered = false;

			if (checkpointTriggered || shouldTriggerPrune(state.config.pruneOn, state.engine.prune.batchStepCounter, state.config.pruneBatchSize, hasPendingTools, lastAssistantPureText)) {
				const { summarizeToolBatchPool } = await import("../projection/tool-pruner.ts");
				if (state.engine.prune.pendingBatches.length > 0) {
					const pool = await summarizeToolBatchPool(pi, state.engine.prune.pendingBatches, {
						enabled: true,
						pruneOn: state.config.pruneOn as any,
						summarizerModel: state.config.pruneModel,
						includeContext: state.config.pruneIncludeContext,
					}, { signal: ctx.signal, ctx });
					recordPruneSummarizeImpact(state, pool.metrics);
					if (state.config.diagnostics) {
						state.engine.prune.impact.lastSummarizePrompt = pool.debug?.prompt;
						state.engine.prune.impact.lastSummarizeResponse = pool.debug?.responseText;
						state.engine.prune.impact.lastAcceptedSummaries = pool.debug?.acceptedSummaries;
						state.engine.prune.impact.lastSummarizeMaxTokens = pool.debug?.maxTokens;
					}
					if (pool.metrics.requests > 0) persistTelemetry(pi, state);
					if (pool.metrics.requests === 0) {
						notify(ctx, t("engine.prune.failed", { error: pool.metrics.error ?? "summary request did not run" }), "warning");
						persistTelemetry(pi, state);
						return;
					}
					const results = pool.results;

					let summarized = 0;
					let skippedOversized = 0;
					for (let i = 0; i < state.engine.prune.pendingBatches.length; i++) {
						const result = results[i];
						if (result) {
							const batch = state.engine.prune.pendingBatches[i];
							if (!isReplacementSummaryEfficient(batch, result.summaryText)) {
								state.engine.prune.skippedOversizedIds ??= [];
								for (const tc of batch.toolCalls) {
									if (!state.engine.prune.skippedOversizedIds.includes(tc.id)) {
										state.engine.prune.skippedOversizedIds.push(tc.id);
										skippedOversized++;
									}
								}
								continue;
							}

							let wroteSummaryForBatch = false;
							for (const tc of batch.toolCalls) {
								if (!state.engine.prune.summarizedIds.includes(tc.id)) {
									state.engine.prune.summarizedIds.push(tc.id);
									const summaryText = wroteSummaryForBatch ? undefined : result.summaryText;
									state.toolIndexer.markSummarized(tc.id, tc.name, tc.turnIndex, summaryText);
									state.engine.prune.summarizedRecords ??= [];
									state.engine.prune.summarizedRecords.push({ toolCallId: tc.id, toolName: tc.name, turnIndex: tc.turnIndex, summarized: true, summaryText });
									wroteSummaryForBatch = true;
									summarized++;
								}
							}
						}
					}
					if (state.config.persistDiagnostics && pool.metrics.requests > 0) {
						appendPruneDebugEntry(pi, {
							turn: state.engine.turnIndex,
							mode: state.config.pruneOn,
							model: state.config.pruneModel,
							outcome: summarized > 0 ? "summarized" : skippedOversized > 0 ? "skipped-oversized" : "failed",
							batches: state.engine.prune.pendingBatches.length,
							toolCalls: pool.metrics.toolCalls,
							summarized,
							skippedOversized,
							rawChars: pool.metrics.rawChars ?? 0,
							summaryChars: pool.metrics.summaryChars ?? 0,
							cost: pool.metrics.cost,
							maxTokens: pool.debug?.maxTokens,
							prompt: pool.debug?.prompt,
							response: pool.debug?.responseText,
							acceptedSummaries: pool.debug?.acceptedSummaries,
							error: pool.metrics.error,
						});
					}
					if (summarized > 0 || skippedOversized > 0) {
						state.engine.prune.pendingBatches = [];
						state.engine.prune.batchStepCounter = 0;
						if (summarized > 0) notify(ctx, t("engine.prune.triggered", { count: summarized }), "info");
						if (skippedOversized > 0) notify(ctx, t("engine.prune.failed", { error: `skipped ${skippedOversized} oversized tool calls` }), "warning");
						persistTelemetry(pi, state);
					} else {
						notify(ctx, t("engine.prune.failed", { error: "summary response did not contain usable summaries" }), "warning");
						persistTelemetry(pi, state);
					}
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			state.engine.prune.impact.lastError = message;
			notify(ctx, t("engine.prune.failed", { error: message }), "warning");
			persistTelemetry(pi, state);
		}
	}
}

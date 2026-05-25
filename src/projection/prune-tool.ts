/**
 * context_prune tool — summarize and prune tool call results.
 */
import { Type } from "typebox";
import type { Static } from "typebox";
import { t } from "../i18n/index.ts";
import { extractAssistantToolCalls, extractMessageContext, hasAssistantToolCalls } from "./batch-capture.ts";
import { recordPruneSummarizeImpact } from "./prune-impact.ts";
import type { RuntimeState } from "../runtime-state.ts";
import { buildObservationMaskSummary, isReplacementSummaryEfficient } from "./tool-pruner.ts";
import type { ToolCallIndexerInstance } from "./indexer.ts";
import { appendPruneDebugEntry, persistTelemetry } from "../telemetry-persistence.ts";

export const CUSTOM_TYPE_PRUNE_SUMMARY = "context-engine-prune-summary";

const PruneParams = Type.Object({
	mode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("interactive")], { description: t("tool.prune.param.mode") })),
});

export function emitPruneSummaryMessage(pi: any, ctx: any, summaryText: string, details?: unknown): void {
	if (!summaryText?.trim()) return;
	if (typeof pi?.sendMessage === "function") {
		pi.sendMessage(
			{ customType: CUSTOM_TYPE_PRUNE_SUMMARY, content: summaryText, display: false, details },
			{ deliverAs: "steer" },
		);
		return;
	}
	const append = ctx?.sessionManager?.appendCustomMessageEntry;
	if (typeof append === "function") append.call(ctx.sessionManager, CUSTOM_TYPE_PRUNE_SUMMARY, summaryText, false, details);
}

function isHandledToolCall(id: string, indexer: ToolCallIndexerInstance, state?: RuntimeState): boolean {
	return indexer.isSummarized(id)
		|| Boolean(state?.engine.prune.summarizedIds.includes(id))
		|| Boolean(state?.engine.prune.appliedIds.includes(id))
		|| Boolean(state?.engine.prune.skippedOversizedIds?.includes(id))
		|| Boolean(state?.engine.prune.skippedMissingResultIds?.includes(id));
}

function handledReason(id: string, indexer: ToolCallIndexerInstance, state?: RuntimeState): string | undefined {
	if (indexer.isSummarized(id) || state?.engine.prune.summarizedIds.includes(id)) return "summarized";
	if (state?.engine.prune.appliedIds.includes(id)) return "applied";
	if (state?.engine.prune.skippedOversizedIds?.includes(id)) return "skipped_oversized";
	if (state?.engine.prune.skippedMissingResultIds?.includes(id)) return "skipped_missing_result";
	return undefined;
}

function clearLastSummarizerAttempt(state: RuntimeState, error?: string): void {
	const impact = state.engine.prune.impact;
	impact.lastSummarizePrompt = undefined;
	impact.lastSummarizeResponse = undefined;
	impact.lastAcceptedSummaries = undefined;
	impact.lastSummarizeMaxTokens = undefined;
	impact.lastSummarizeCost = 0;
	impact.lastSummarizeToolCalls = 0;
	impact.lastSummarizeRawChars = 0;
	impact.lastSummarizeSummaryChars = 0;
	if (error) impact.lastError = error;
	else delete impact.lastError;
}

export async function executePrune(
	pi: any,
	ctx: any,
	indexer: ToolCallIndexerInstance,
	state?: RuntimeState | { config?: any },
	mode: "auto" | "interactive" = "auto",
	signal?: AbortSignal,
): Promise<{ text: string; details: Record<string, any> }> {
	const cfg = state ?? { config: {} };
	const runtimeState = state && "engine" in state ? state as RuntimeState : undefined;
	const sm = ctx?.sessionManager;
	if (!sm) return { text: t("tool.prune.error.noSession"), details: { reason: "no_session" } };

	const branch = sm.getBranch?.() ?? [];
	const batches = [];
	let currentBatch: any = null;
	const scan = { seen: 0, summarized: 0, applied: 0, skippedOversized: 0, skippedMissingResult: 0, unhandled: 0 };

	for (const entry of branch) {
		const msg = entry.message;
		if (!msg) continue;
		const assistantToolCallMessage = hasAssistantToolCalls(msg);

		if (assistantToolCallMessage) {
			const callContext = extractMessageContext(msg);
			for (const tc of extractAssistantToolCalls(msg)) {
				const id = tc.id ?? tc.name;
				if (!id) continue;
				scan.seen++;
				const reason = handledReason(id, indexer, runtimeState);
				if (reason === "summarized") scan.summarized++;
				else if (reason === "applied") scan.applied++;
				else if (reason === "skipped_oversized") scan.skippedOversized++;
				else if (reason === "skipped_missing_result") scan.skippedMissingResult++;
				else scan.unhandled++;
				if (!reason) {
					if (!currentBatch) {
						currentBatch = { turnIndex: entry.turnIndex ?? 0, toolCalls: [] };
						batches.push(currentBatch);
					}
					currentBatch.toolCalls.push({
						id,
						name: tc.name ?? "unknown",
						args: tc.args,
						context: callContext,
					});
				}
			}
		} else if (msg.role === "tool" || msg.role === "toolResult") {
			const tcId = msg.toolCallId ?? msg.tool_call_id;
			if (tcId && currentBatch) {
				const tc = currentBatch.toolCalls.find((t: any) => t.id === tcId);
				if (tc) tc.result = typeof msg.content === "string" ? msg.content.slice(0, 5000) : JSON.stringify(msg.content).slice(0, 5000);
			}
		}

		if (msg.role !== "tool" && msg.role !== "toolResult" && !assistantToolCallMessage) currentBatch = null;
	}

	if (batches.length === 0 || batches.every((b: any) => b.toolCalls.length === 0)) {
		if (runtimeState) {
			clearLastSummarizerAttempt(runtimeState);
			persistTelemetry(pi, runtimeState);
		}
		return { text: t("tool.prune.noneFound"), details: { reason: "none_found", summarized: 0, skippedOversized: 0, attempted: 0, scan } };
	}

	let missingResults = 0;
	const missingResultIds: string[] = [];
	for (const batch of batches) {
		const before = batch.toolCalls.length;
		batch.toolCalls = batch.toolCalls.filter((tc: any) => {
			const hasResult = typeof tc.result === "string" && tc.result.trim().length > 0;
			if (!hasResult && tc.id) missingResultIds.push(tc.id);
			return hasResult;
		});
		missingResults += before - batch.toolCalls.length;
	}
	const usableBatches = batches.filter((batch: any) => batch.toolCalls.length > 0);
	if (usableBatches.length === 0) {
		if (runtimeState) {
			runtimeState.engine.prune.skippedMissingResultIds ??= [];
			for (const id of missingResultIds) {
				if (!runtimeState.engine.prune.skippedMissingResultIds.includes(id)) runtimeState.engine.prune.skippedMissingResultIds.push(id);
			}
			clearLastSummarizerAttempt(runtimeState, "missing_tool_results");
			persistTelemetry(pi, runtimeState);
		}
		return {
			text: t("tool.prune.noneSummarized"),
			details: { reason: "missing_tool_results", summarized: 0, skippedOversized: 0, attempted: missingResults, missingResults, batches: batches.length, summaryRequests: 0, scan, error: "tool calls have no replayable tool results in restored session branch" },
		};
	}

	if (mode === "interactive") {
		const list = usableBatches.flatMap((b: any) => b.toolCalls).map((t: any) => `${t.name}(${t.id})`);
		return { text: t("tool.prune.interactive", { count: list.length }) + `\n${list.join("\n")}`, details: { toolCalls: list } };
	}

	const { summarizeToolBatchPool } = await import("./tool-pruner.ts");
	const pModel = cfg.config?.pruneModel ?? "deepseek-v4-flash";
	const smModel = (pModel === "auto" || pModel === "default") && ctx?.model?.id ? ctx.model.id : pModel;
	const pool = await summarizeToolBatchPool(
		pi,
		usableBatches,
		{ enabled: true, pruneOn: "every-turn", summarizerModel: smModel, includeContext: cfg.config?.pruneIncludeContext !== false },
		{ signal, ctx },
	);
	if ((state as RuntimeState | undefined)?.engine?.prune) {
		recordPruneSummarizeImpact(state as RuntimeState, pool.metrics);
		if (runtimeState?.config.diagnostics) {
			runtimeState.engine.prune.impact.lastSummarizePrompt = pool.debug?.prompt;
			runtimeState.engine.prune.impact.lastSummarizeResponse = pool.debug?.responseText;
			runtimeState.engine.prune.impact.lastAcceptedSummaries = pool.debug?.acceptedSummaries;
			runtimeState.engine.prune.impact.lastSummarizeMaxTokens = pool.debug?.maxTokens;
		}
	}
	const results = pool.results;

	let summarized = 0;
	let skippedOversized = 0;
	const acceptedSummaries: string[] = [];
	for (let i = 0; i < usableBatches.length; i++) {
		const batch = usableBatches[i];
		let result = results[i];
		if (!result) continue;
		if (!isReplacementSummaryEfficient(batch, result.summaryText)) {
			const mask = buildObservationMaskSummary(batch, "replacement summary was larger than raw tool slice");
			if (isReplacementSummaryEfficient(batch, mask)) {
				result = { summaryText: mask, usage: result.usage };
			} else {
				const skippedIds = runtimeState ? (runtimeState.engine.prune.skippedOversizedIds ??= []) : undefined;
				for (const tc of batch.toolCalls) {
					if (skippedIds && !skippedIds.includes(tc.id)) skippedIds.push(tc.id);
					skippedOversized++;
				}
				continue;
			}
		}
		if (result.summaryText.trim()) acceptedSummaries.push(result.summaryText.trim());
		for (const tc of batch.toolCalls) {
			indexer.markSummarized(tc.id, tc.name, batch.turnIndex, result.summaryText);
			if (runtimeState) {
				if (!runtimeState.engine.prune.summarizedIds.includes(tc.id)) {
					runtimeState.engine.prune.summarizedIds.push(tc.id);
				}
				runtimeState.engine.prune.summarizedRecords ??= [];
				runtimeState.engine.prune.summarizedRecords.push({
					toolCallId: tc.id,
					toolName: tc.name,
					turnIndex: batch.turnIndex,
					summarized: true,
					summaryText: result.summaryText,
				});
			}
			summarized++;
		}
	}
	if (acceptedSummaries.length > 0) {
		emitPruneSummaryMessage(
			pi,
			ctx,
			Array.from(new Set(acceptedSummaries)).join("\n\n"),
			{ batches: usableBatches.length, mode: "manual-prune" },
		);
	}
	if (runtimeState?.config.persistDiagnostics && (pool.metrics.requests > 0 || pool.metrics.error || pool.debug)) {
		appendPruneDebugEntry(pi, {
			turn: runtimeState.engine.turnIndex,
			mode: "manual-prune",
			model: smModel,
			outcome: summarized > 0 ? "summarized" : skippedOversized > 0 ? "skipped-oversized" : "failed",
			batches: usableBatches.length,
			toolCalls: pool.metrics.toolCalls,
			summarized,
			skippedOversized,
			missingResults,
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
	if (runtimeState) persistTelemetry(pi, runtimeState);

	return {
		text: summarized > 0 ? t("tool.prune.summarized", { count: summarized }) : skippedOversized > 0 ? t("tool.prune.skippedOversized", { count: skippedOversized }) : t("tool.prune.noneSummarized"),
		details: {
			summarized,
			skippedOversized,
			attempted: usableBatches.reduce((sum: number, batch: any) => sum + batch.toolCalls.length, 0),
			missingResults,
			batches: usableBatches.length,
			summaryRequests: pool.metrics.requests,
			summaryInputTokens: pool.metrics.inputTokens,
			summaryOutputTokens: pool.metrics.outputTokens,
			rawChars: pool.metrics.rawChars ?? 0,
			summaryChars: pool.metrics.summaryChars ?? 0,
			modelId: pool.metrics.modelId ?? smModel,
			promptChars: pool.debug?.prompt.length ?? 0,
			responseChars: pool.debug?.responseText.length ?? 0,
			acceptedSummaries: pool.debug?.acceptedSummaries?.length ?? 0,
			maxTokens: pool.debug?.maxTokens,
			scan,
			reason: summarized > 0 ? "summarized" : skippedOversized > 0 ? "skipped_oversized" : "none_summarized",
			error: pool.metrics.error ?? (summarized === 0 && skippedOversized === 0 ? "summary response did not contain usable summaries" : undefined),
		},
	};
}

export function registerPruneTool(pi: any, indexer: ToolCallIndexerInstance, state?: RuntimeState | { config?: any }): void {

	pi.registerTool?.({
		name: "context_prune",
		label: t("tool.prune.label"),
		description: t("tool.prune.longDescription"),
		parameters: PruneParams,
		async execute(_id: string, params: Static<typeof PruneParams>, signal: AbortSignal, _onUpdate: any, ctx: any) {
			const result = await executePrune(pi, ctx, indexer, state, params.mode ?? "auto", signal);
			return { content: [{ type: "text", text: result.text }], details: result.details };
		},
	});
}

export function syncPruneToolActivation(pi: any, config: { enabled?: boolean; pruneOn?: string }): void {
	try {
		if (typeof pi?.getActiveTools !== "function" || typeof pi?.setActiveTools !== "function") return;
		const activeTools = pi.getActiveTools();
		if (!Array.isArray(activeTools)) return;
		const shouldActivate = config.enabled !== false && config.pruneOn === "agentic-auto";
		const hasTool = activeTools.includes("context_prune");
		if (shouldActivate && !hasTool) pi.setActiveTools([...activeTools, "context_prune"]);
		if (!shouldActivate && hasTool) pi.setActiveTools(activeTools.filter((name: string) => name !== "context_prune"));
	} catch (error) {
		if (String(error instanceof Error ? error.message : error).includes("runtime not initialized")) return;
		throw error;
	}
}

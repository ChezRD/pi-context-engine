/**
 * context_prune tool — summarize and prune tool call results.
 */
import { Type } from "typebox";
import type { Static } from "typebox";
import type { ToolCallIndexerInstance } from "./indexer.ts";
import { t } from "../i18n/index.ts";
import { extractAssistantToolCalls, extractMessageContext, hasAssistantToolCalls } from "./batch-capture.ts";
import { recordPruneSummarizeImpact } from "./prune-impact.ts";
import type { RuntimeState } from "../runtime-state.ts";
import { isReplacementSummaryEfficient } from "./tool-pruner.ts";

const PruneParams = Type.Object({
	mode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("interactive")], { description: "Pruning mode. 'auto' summarizes all pending tool calls (default). 'interactive' returns them for review." })),
});

export function registerPruneTool(pi: any, indexer: ToolCallIndexerInstance, state?: RuntimeState | { config?: any }): void {
	const cfg = state ?? { config: {} };
	const runtimeState = state && "engine" in state ? state as RuntimeState : undefined;

	pi.registerTool?.({
		name: "context_prune",
		label: "Prune Tool Calls",
		description: "Summarize and prune verbose tool call results from context to free space.",
		parameters: PruneParams,
		async execute(_id: string, params: Static<typeof PruneParams>, signal: AbortSignal, _onUpdate: any, ctx: any) {
			const sm = ctx.sessionManager;
			if (!sm) return { content: [{ type: "text", text: t("tool.prune.error.noSession") }], details: {} };

			// Collect tool calls from session history
			const branch = sm.getBranch?.() ?? [];
			const batches = [];
			let currentBatch: any = null;

			for (const entry of branch) {
				const msg = entry.message;
				if (!msg) continue;

				if (hasAssistantToolCalls(msg)) {
					const callContext = extractMessageContext(msg);
					for (const tc of extractAssistantToolCalls(msg)) {
						const id = tc.id ?? tc.name;
						if (id && !indexer.isSummarized(id)) {
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

				if (msg.role !== "tool" && msg.role !== "toolResult") {
					currentBatch = null;
				}
			}

			if (batches.length === 0 || batches.every((b: any) => b.toolCalls.length === 0)) {
				return { content: [{ type: "text", text: t("tool.prune.noneFound") }], details: {} };
			}

			if (params.mode === "interactive") {
				const list = batches.flatMap((b: any) => b.toolCalls).map((t: any) => `${t.name}(${t.id})`);
				return { content: [{ type: "text", text: t("tool.prune.interactive", { count: list.length }) + `\n${list.join("\n")}` }], details: { toolCalls: list } };
			}

			const { summarizeToolBatchPool } = await import("./tool-pruner.ts");
			const pModel = cfg.config?.pruneModel ?? "deepseek-v4-flash";
			const smModel = (pModel === "auto" || pModel === "default") && ctx?.model?.id ? ctx.model.id : pModel;
			const pool = await summarizeToolBatchPool(pi, batches, { enabled: true, pruneOn: "every-turn", summarizerModel: smModel, includeContext: cfg.config?.pruneIncludeContext !== false }, { signal });
			if ((state as RuntimeState | undefined)?.engine?.prune) recordPruneSummarizeImpact(state as RuntimeState, pool.metrics);
			const results = pool.results;

			let summarized = 0;
			let skippedOversized = 0;
			for (let i = 0; i < batches.length; i++) {
				const batch = batches[i];
				const result = results[i];
				if (result) {
					if (!isReplacementSummaryEfficient(batch, result.summaryText)) {
						const skippedIds = runtimeState ? (runtimeState.engine.prune.skippedOversizedIds ??= []) : undefined;
						for (const tc of batch.toolCalls) {
							if (skippedIds && !skippedIds.includes(tc.id)) {
								skippedIds.push(tc.id);
							}
							skippedOversized++;
						}
						continue;
					}
					for (const tc of batch.toolCalls) {
						indexer.markSummarized(tc.id, tc.name, batch.turnIndex, result.summaryText);
						summarized++;
					}
				}
			}

			return {
				content: [{ type: "text", text: summarized > 0 ? t("tool.prune.summarized", { count: summarized }) : skippedOversized > 0 ? `Skipped ${skippedOversized} oversized tool calls.` : t("tool.prune.noneSummarized") }],
				details: { summarized, skippedOversized },
			};
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

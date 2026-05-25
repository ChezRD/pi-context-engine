import type { RuntimeState } from "../runtime-state.ts";
import { estimateTurnStart } from "./decision-engine.ts";
import { maybeInjectCachePrompt } from "./cache-prompt-inject.ts";
import { checkPrefixStability } from "./prefix-stability.ts";
import { handleAgentMessagePrune, handleTurnEnd as decideAtTurnEnd, requestFold } from "./auto-compact.ts";
import { handleProviderPrefix } from "./prefix-fingerprint.ts";
import { handleSessionBeforeCompact as beforeCompact } from "./custom-compaction.ts";
import { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
import { detectTextualToolCall, handleToolCall as toolCall } from "./tool-stability.ts";
import { rebuildPrunedContext } from "../projection/rebuild.ts";
export { holdCompaction, requestCompact, requestFold } from "./auto-compact.ts";
export { registerFoldTool } from "./fold-tool.ts";
export { buildContextStatus, canCompactNow, decideCompaction, decisionLabel, estimateTurnStart } from "./decision-engine.ts";
export { diffPrefix, extractCachePrefix, handleProviderPrefix, normalizeTools, shouldNotifyPrefixDrift, stableHash } from "./prefix-fingerprint.ts";
export { annotateUsageForCurrentSegment, currentCacheSegment, handlePrefixCheckpoint, openCacheCheckpoint } from "./cache-checkpoints.ts";
export { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
export { detectTextualToolCall } from "./tool-stability.ts";
export { registerParallelReadTool } from "./parallel-read-tool.ts";

export async function handleBeforeAgentStart(pi: any, event: any, ctx: any, state: RuntimeState): Promise<any | undefined> {
	// Pre-flight fold check
	if (state.config.enabled && state.config.autoFold && state.engine.turnIndex > 0) {
		const preflight = estimateTurnStart(ctx, state.config);
		if (preflight.shouldFold) {
			ctx?.ui?.notify?.("Context above 90% — pre-flight fold triggered.", "warning");
			await requestFold(pi, ctx, state, { reason: "preflight" });
		}
	}
	return maybeInjectCachePrompt(event, ctx, state);
}

export async function handleContext(event: any, ctx: any, state: RuntimeState): Promise<any | undefined> {
	let changed = false;

	// Step 1: Tool pruning (Pillar 1) — remove summarized tool results
	if (event?.messages && state.toolIndexer?.getAllSummarized()?.length > 0) {
		const rebuild = rebuildPrunedContext(event.messages, state);
		if (rebuild.changed) {
			event.messages = rebuild.messages;
			changed = true;
		}
		// Summaries are now injected directly into the toolResult content by pruneMessages.
	}

	// Step 2: Semantic fold projection
	if (state.engine.semanticFold.active && state.engine.semanticFold.syntheticMsg) {
		const foldState = state.engine.semanticFold;
		const messages = event?.messages ?? [];
		if (messages.length === 0) return undefined;

		// Get branch entries for tail
		let tailEntries: any[] = [];
		try {
			const branch = await ctx?.sessionManager?.getBranch?.();
			if (branch) {
				const entries = [...branch].reverse(); // root → leaf
				const tailStartIdx = foldState.tailStartEntryId
					? entries.findIndex((e: any) => e.id === foldState.tailStartEntryId)
					: entries.length;
				if (tailStartIdx >= 0 && tailStartIdx < entries.length) {
					tailEntries = entries.slice(tailStartIdx).map((e: any) => e.message).filter(Boolean);
				}
			}
		} catch {
			// Fall through to append-only projection
		}

		// Build filtered context: system + synthetic + tail
		const filtered: any[] = [messages[0], foldState.syntheticMsg, ...tailEntries];
		return { messages: filtered };
	}

	// Fallback: append-only projection
	const projection = applyAppendOnlyProjection(event, ctx, state);
	checkPrefixStability(projection ?? event, ctx, state);
	return projection ?? (changed ? { messages: event.messages } : undefined);
}

export function handleBeforeProviderRequest(event: any, ctx: any, state: RuntimeState): void {
	handleProviderPrefix(event, ctx, state);
}

export async function handleTurnEnd(event: any, pi: any, ctx: any, state: RuntimeState): Promise<void> {
	if (typeof event?.turnIndex === "number") state.engine.turnIndex = event.turnIndex;
	else state.engine.turnIndex++;
	await decideAtTurnEnd(pi, ctx, state, event);
}

export async function handleMessageEnd(event: any, pi: any, ctx: any, state: RuntimeState): Promise<void> {
	await handleAgentMessagePrune(pi, ctx, state, event);
}

export function handleSessionBeforeCompact(event: any, ctx: any, state: RuntimeState): any | undefined {
	return beforeCompact(event, ctx, state);
}

export function handleToolCall(event: any, ctx: any, state: RuntimeState): any | undefined {
	return toolCall(event, ctx, state);
}

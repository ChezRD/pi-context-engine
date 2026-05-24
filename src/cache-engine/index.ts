import type { RuntimeState } from "../runtime-state.ts";
import { maybeInjectCachePrompt } from "./cache-prompt-inject.ts";
import { checkPrefixStability } from "./prefix-stability.ts";
import { handleTurnEnd as decideAtTurnEnd } from "./auto-compact.ts";
import { handleProviderPrefix } from "./prefix-fingerprint.ts";
import { handleSessionBeforeCompact as beforeCompact } from "./custom-compaction.ts";
import { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
import { detectTextualToolCall, handleToolCall as toolCall } from "./tool-stability.ts";
export { holdCompaction, requestCompact, requestFold } from "./auto-compact.ts";
export { registerFoldTool } from "./fold-tool.ts";
export { buildContextStatus, canCompactNow, decideCompaction, decisionLabel } from "./decision-engine.ts";
export { diffPrefix, extractCachePrefix, handleProviderPrefix, normalizeTools, shouldNotifyPrefixDrift, stableHash } from "./prefix-fingerprint.ts";
export { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
export { detectTextualToolCall } from "./tool-stability.ts";
export { registerParallelReadTool } from "./parallel-read-tool.ts";

export function handleBeforeAgentStart(event: any, ctx: any, state: RuntimeState): any | undefined {
	return maybeInjectCachePrompt(event, ctx, state);
}

export function handleContext(event: any, ctx: any, state: RuntimeState): any | undefined {
	const projection = applyAppendOnlyProjection(event, ctx, state);
	checkPrefixStability(projection ?? event, ctx, state);
	return projection;
}

export function handleBeforeProviderRequest(event: any, ctx: any, state: RuntimeState): void {
	handleProviderPrefix(event, ctx, state);
}

export function handleTurnEnd(event: any, pi: any, ctx: any, state: RuntimeState): void {
	if (typeof event?.turnIndex === "number") state.engine.turnIndex = event.turnIndex;
	else state.engine.turnIndex++;
	decideAtTurnEnd(pi, ctx, state);
}

export function handleSessionBeforeCompact(event: any, ctx: any, state: RuntimeState): any | undefined {
	return beforeCompact(event, ctx, state);
}

export function handleToolCall(event: any, ctx: any, state: RuntimeState): any | undefined {
	return toolCall(event, ctx, state);
}

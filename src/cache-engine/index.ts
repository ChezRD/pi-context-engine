import type { RuntimeState } from "../runtime-state.ts";
import { estimateTurnStart } from "./decision-engine.ts";
import { maybeInjectCachePrompt } from "./cache-prompt-inject.ts";
import { checkPrefixStability } from "./prefix-stability.ts";
import { flushAgentMessagePruneAtAgentStart, flushAgentMessagePruneFallback, handleAgentMessagePrune, handleTurnEnd as decideAtTurnEnd, requestFold } from "./auto-compact.ts";
import { handleProviderPrefix } from "./prefix-fingerprint.ts";
import { handleSessionBeforeCompact as beforeCompact } from "./custom-compaction.ts";
import { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
import { clearRecentToolCalls, handleAssistantMessageIntent, handleUserIntent, maybeAppendEffectiveGuidanceMessage, maybeBuildEffectiveGuidanceMessage, handleToolCall as toolCall } from "./tool-stability.ts";
import { rebuildPrunedContext } from "../projection/rebuild.ts";
import { buildEffectiveFoldGuidance } from "../projection/history-folder.ts";
import { t } from "../i18n/index.ts";
export { flushAgentMessagePruneAtAgentStart, flushAgentMessagePruneFallback, holdCompaction, requestCompact, requestFold } from "./auto-compact.ts";
export { registerFoldTool } from "./fold-tool.ts";
export { buildContextStatus, canCompactNow, decideCompaction, decisionLabel, estimateTurnStart } from "./decision-engine.ts";
export { diffPrefix, extractCachePrefix, handleProviderPrefix, normalizeTools, shouldNotifyPrefixDrift, stableHash } from "./prefix-fingerprint.ts";
export { annotateUsageForCurrentSegment, currentCacheSegment, handlePrefixCheckpoint, openCacheCheckpoint } from "./cache-checkpoints.ts";
export { activateAppendOnlyProjectionFromCompact, applyAppendOnlyProjection } from "./append-only-projection.ts";
export { clearRecentToolCalls, detectTextualToolCall } from "./tool-stability.ts";
export { detectToolIntent, detectUserIntent, detectUserIntentMultilingual, loadToolIntentVocabulary } from "./tool-intent.ts";
export { buildToolIntentNudge, reserveToolIntentNudge } from "./tool-intent-injection.ts";
export { registerParallelReadTool } from "./parallel-read-tool.ts";

export async function handleBeforeAgentStart(pi: any, event: any, ctx: any, state: RuntimeState): Promise<any | undefined> {
	handleUserIntent(event, state, { onlyIfInputNotSeen: true });
	await flushAgentMessagePruneAtAgentStart(pi, ctx, state);
	// Pre-flight fold check
	if (state.config.enabled && state.config.autoFold && state.engine.turnIndex > 0) {
		const preflight = estimateTurnStart(ctx, state.config);
		if (preflight.shouldFold) {
			ctx?.ui?.notify?.(t("engine.notify.preflightFold"), "warning");
			await requestFold(pi, ctx, state, { reason: "preflight" });
		}
	}
	const cachePrompt = maybeInjectCachePrompt(event, ctx, state);
	const guidanceMessage = maybeBuildEffectiveGuidanceMessage(state, pi, "before_agent_start", ["user-intent"]);
	if (!cachePrompt && !guidanceMessage) return undefined;
	return { ...(cachePrompt ?? {}), ...(guidanceMessage ? { message: guidanceMessage } : {}) };
}

export function handleInput(event: any, _ctx: any, state: RuntimeState): void {
	handleUserIntent(event, state);
}

function latestUserMessage(messages: any[] | undefined): any | undefined {
	if (!Array.isArray(messages)) return undefined;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role === "user") return messages[i];
	}
	return undefined;
}

function ensureUserIntentFromMessages(messages: any[] | undefined, state: RuntimeState): void {
	const userMessage = latestUserMessage(messages);
	if (userMessage) handleUserIntent(userMessage, state, { onlyIfInputNotSeen: true });
}

function messageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((part) => {
		if (typeof part === "string") return part;
		if (part && typeof part === "object" && typeof part.text === "string") return part.text;
		return "";
	}).filter(Boolean).join("\n");
}

function hasFoldGuidance(messages: any[] | undefined): boolean {
	return Array.isArray(messages) && messages.some((message) => messageText(message).includes("[pi-context-engine fold guidance]") || messageText(message).includes("<!-- pi-context-engine: fold guidance -->"));
}

function hasGuidanceMarker(messages: any[] | undefined): boolean {
	return Array.isArray(messages) && messages.some((message) => messageText(message).includes("[pi-context-engine guidance]") || messageText(message).includes("<!-- pi-context-engine: guidance -->"));
}

function endsWithToolMessage(messages: any[] | undefined): boolean {
	return Array.isArray(messages) && messages.length > 0 && messages[messages.length - 1]?.role === "tool";
}

function shouldInjectFoldGuidance(state: RuntimeState, includeHostCompact: boolean): boolean {
	return Boolean(state.engine.semanticFold.active || (includeHostCompact && state.engine.compactCount > 0));
}

function buildFoldGuidanceMessage(state: RuntimeState): any {
	const content = `<!-- pi-context-engine: fold guidance -->\n${buildEffectiveFoldGuidance(state.engine.toolIntent.lastUserIntent)}\n<!-- /pi-context-engine: fold guidance -->`;
	return { role: "system", content };
}

function appendFoldGuidance(messages: any[] | undefined, state: RuntimeState, includeHostCompact = false): any[] | undefined {
	if (!Array.isArray(messages) || !shouldInjectFoldGuidance(state, includeHostCompact) || hasFoldGuidance(messages)) return undefined;
	return [...messages, buildFoldGuidanceMessage(state)];
}

export async function handleContext(event: any, ctx: any, state: RuntimeState, pi?: any): Promise<any | undefined> {
	let changed = false;
	let guidanceMessage: any | undefined;
	let foldGuidanceMessage: any | undefined;
	if (Array.isArray(event?.messages)) {
		const guidedByIntent = maybeAppendEffectiveGuidanceMessage(event.messages, ctx, state, pi);
		if (guidedByIntent) {
			event.messages = guidedByIntent;
			guidanceMessage = guidedByIntent[guidedByIntent.length - 1];
			changed = true;
		}
		const guidedMessages = appendFoldGuidance(event.messages, state);
		if (guidedMessages) {
			event.messages = guidedMessages;
			foldGuidanceMessage = guidedMessages[guidedMessages.length - 1];
			changed = true;
		}
	}

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
		const filtered: any[] = [messages[0], ...(guidanceMessage ? [guidanceMessage] : []), ...(foldGuidanceMessage ? [foldGuidanceMessage] : []), foldState.syntheticMsg, ...tailEntries];
		return { messages: filtered };
	}

	// Fallback: append-only projection
	const projection = applyAppendOnlyProjection(event, ctx, state);
	checkPrefixStability(projection ?? event, ctx, state);
	return projection ?? (changed ? { messages: event.messages } : undefined);
}

export async function handleBeforeProviderRequest(event: any, pi: any, ctx: any, state: RuntimeState): Promise<void> {
	handleProviderPrefix(event, ctx, state);
	const payload = event?.payload ?? event?.body ?? event;
	ensureUserIntentFromMessages(payload?.messages ?? event?.messages, state);
	if (Array.isArray(payload?.messages)) {
		payload.messages = payload.messages.map((msg: any) => {
			if (msg?.role === "custom") {
				return {
					role: "user",
					content: typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : msg.content,
					timestamp: msg.timestamp,
				};
			}
			return msg;
		});
	}
	if (!endsWithToolMessage(payload?.messages)) {
		const intentGuidance = maybeBuildEffectiveGuidanceMessage(state, pi, "before_provider_request", ["user-intent"]);
		if (intentGuidance && !hasGuidanceMarker(payload?.messages)) {
			const providerGuidance = { role: "system", content: messageText(intentGuidance) };
			payload.messages = Array.isArray(payload.messages) ? [...payload.messages, providerGuidance] : [providerGuidance];
		}
		const guidedPayload = appendFoldGuidance(payload?.messages, state, true);
		if (guidedPayload) payload.messages = guidedPayload;
	}
	const flushed = await flushAgentMessagePruneFallback(pi, ctx, state);
	if (!flushed) return;
	if (Array.isArray(payload?.messages)) {
		const rebuild = rebuildPrunedContext(payload.messages, state);
		if (rebuild.changed) payload.messages = rebuild.messages;
	}
}

export async function handleTurnEnd(event: any, pi: any, ctx: any, state: RuntimeState): Promise<void> {
	if (typeof event?.turnIndex === "number") state.engine.turnIndex = event.turnIndex;
	else state.engine.turnIndex++;
	await decideAtTurnEnd(pi, ctx, state, event);
}

export async function handleMessageEnd(event: any, pi: any, ctx: any, state: RuntimeState): Promise<void> {
	handleAssistantMessageIntent(event?.message ?? event, state);
	await handleAgentMessagePrune(pi, ctx, state, event);
}

export function handleSessionBeforeCompact(event: any, ctx: any, state: RuntimeState): any | undefined {
	return beforeCompact(event, ctx, state);
}

export function handleToolCall(event: any, ctx: any, state: RuntimeState): any | undefined {
	return toolCall(event, ctx, state);
}

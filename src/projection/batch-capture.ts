/**
 * Batch capture — pairs toolCall blocks with their toolResult messages.
 * Called from turn_end handler to build pendingBatches for summarization.
 */
import type { CapturedBatch, CapturedToolCall } from "./types.ts";

const CALL_CONTEXT_CHARS = 600;
const BRIDGE_CONTEXT_CHARS = 1200;
const DEFAULT_DIALOGUE_GAP_CONTEXT_THRESHOLD = 2;

export function extractMessageContext(msg: any): string | undefined {
	const parts: string[] = [];
	if (typeof msg?.reasoningContent === "string") parts.push(msg.reasoningContent);
	if (typeof msg?.reasoning_content === "string") parts.push(msg.reasoning_content);
	if (typeof msg?.thinking === "string") parts.push(msg.thinking);
	if (typeof msg?.content === "string") parts.push(msg.content);
	if (Array.isArray(msg?.content)) {
		for (const part of msg.content) {
			if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
			if ((part?.type === "thinking" || part?.type === "reasoning") && typeof part.text === "string") parts.push(part.text);
			if (part?.type === "thinking" && typeof part.thinking === "string") parts.push(part.thinking);
			if ((part?.type === "reasoning" || part?.type === "reasoning_content") && typeof part.reasoning === "string") parts.push(part.reasoning);
			if ((part?.type === "reasoning" || part?.type === "reasoning_content") && typeof part.reasoning_content === "string") parts.push(part.reasoning_content);
		}
	}
	const text = parts.map((part) => part.trim()).filter(Boolean).join("\n").trim();
	return text ? text.slice(0, CALL_CONTEXT_CHARS) : undefined;
}

function joinContext(parts: Array<string | undefined>): string | undefined {
	const text = parts.map((part) => part?.trim()).filter(Boolean).join("\n\n").trim();
	return text ? text.slice(0, BRIDGE_CONTEXT_CHARS) : undefined;
}

function pendingIds(batches: CapturedBatch[]): Set<string> {
	const ids = new Set<string>();
	for (const batch of batches) for (const tc of batch.toolCalls) ids.add(tc.id);
	return ids;
}

function skipIdSet(skipIds: string[] | undefined, batches: CapturedBatch[]): Set<string> {
	const ids = new Set(skipIds ?? []);
	for (const id of pendingIds(batches)) ids.add(id);
	return ids;
}

function pushPendingBatch(pruneState: { pendingBatches: CapturedBatch[] }, turnIndex: number, toolCalls: CapturedToolCall[], context?: string): void {
	const existingIds = pendingIds(pruneState.pendingBatches);
	const fresh = toolCalls.filter((tc) => !existingIds.has(tc.id));
	if (fresh.length === 0) return;
	pruneState.pendingBatches.push({ turnIndex, context, toolCalls: fresh });
}

function toolResultId(result: any): string | undefined {
	return result?.toolCallId ?? result?.tool_call_id ?? result?.id ?? result?.callId;
}

function toolResultText(result: any): string {
	if (!result) return "";
	if (typeof result.content === "string") return result.content.slice(0, 5000);
	if (Array.isArray(result.content)) {
		return result.content
			.map((part: any) => {
				if (typeof part === "string") return part;
				if (part?.type === "text" && typeof part.text === "string") return part.text;
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.slice(0, 5000);
	}
	if (typeof result.result === "string") return result.result.slice(0, 5000);
	return JSON.stringify(result).slice(0, 5000);
}

export function extractAssistantToolCalls(msg: any): Array<{ id?: string; name?: string; args?: string }> {
	const raw = Array.isArray(msg?.tool_calls)
		? msg.tool_calls
		: Array.isArray(msg?.toolCalls)
			? msg.toolCalls
			: Array.isArray(msg?.content)
				? msg.content.filter((part: any) => part?.type === "toolCall" || part?.type === "tool_use")
				: [];
	return raw.map((tc: any) => {
		const fn = tc?.function ?? {};
		const structuredArgs = tc?.arguments ?? tc?.input;
		return {
			id: tc?.id ?? tc?.toolCallId ?? tc?.tool_call_id ?? tc?.callId ?? fn.name ?? tc?.name,
			name: fn.name ?? tc?.name ?? tc?.toolName ?? "unknown",
			args: typeof fn.arguments === "string"
				? fn.arguments
				: typeof structuredArgs === "string"
					? structuredArgs
					: structuredArgs
						? JSON.stringify(structuredArgs)
						: undefined,
		};
	});
}

export function hasAssistantToolCalls(msg: any): boolean {
	return msg?.role === "assistant" && extractAssistantToolCalls(msg).length > 0;
}

/**
 * Capture the just-finished assistant turn using Pi's turn_end contract:
 * { message: AgentMessage, toolResults: ToolResultMessage[] }.
 *
 * This is more reliable than scanning session history after the fact and is the
 * same source shape used by pi-context-prune.
 */
export function captureTurnEndBatch(
	event: any,
	skipIds: string[],
	pruneState: { pendingBatches: CapturedBatch[] },
	turnIndex: number,
): number {
	const message = event?.message;
	const results = Array.isArray(event?.toolResults) ? event.toolResults : [];
	if (!hasAssistantToolCalls(message) || results.length === 0) return 0;

	const skip = skipIdSet(skipIds, pruneState.pendingBatches);
	const resultMap = new Map<string, any>();
	for (const result of results) {
		const id = toolResultId(result);
		if (id) resultMap.set(id, result);
	}

	const callContext = extractMessageContext(message);
	const toolCalls: CapturedToolCall[] = [];
	for (const tc of extractAssistantToolCalls(message)) {
		const id = tc.id ?? tc.name;
		if (!id || skip.has(id)) continue;
		const result = resultMap.get(id);
		if (!result) continue;
		toolCalls.push({
			id,
			name: tc.name ?? "unknown",
			turnIndex,
			args: tc.args,
			result: toolResultText(result),
			context: callContext,
		});
	}

	pushPendingBatch(pruneState, turnIndex, toolCalls, callContext);
	return toolCalls.length;
}

/**
 * Walk session branch, extract toolCall+toolResult pairs not yet summarized.
 * Returns batches organized by turn.
 */
export function captureBatches(
	branch: any[],
	skipIds: string[],
	pruneState: { pendingBatches: CapturedBatch[]; batchStepCounter: number },
	turnIndex: number,
	options?: { bridgeLength?: number },
): void {
	const bridgeLength = Math.max(1, options?.bridgeLength ?? DEFAULT_DIALOGUE_GAP_CONTEXT_THRESHOLD);
	const skip = skipIdSet(skipIds, pruneState.pendingBatches);
	let currentBatch: CapturedToolCall[] = [];
	let batchTurnIndex = turnIndex;
	let batchContext: string | undefined;
	let inToolSequence = false;
	let hasNewTools = false;
	let seenToolSequence = false;
	let dialogueSinceLastTool: string[] = [];

	for (const entry of branch) {
		const msg = entry.message;
		if (!msg) continue;

		const toolCalls = hasAssistantToolCalls(msg) ? extractAssistantToolCalls(msg) : [];
		if (toolCalls.length > 0) {
			const localReasoning = extractMessageContext(msg);
			const hasLargeDialogueGap = !seenToolSequence || dialogueSinceLastTool.length >= bridgeLength;
			const callContext = hasLargeDialogueGap
				? joinContext([...dialogueSinceLastTool.slice(-4), localReasoning])
				: localReasoning;
			if (inToolSequence && dialogueSinceLastTool.length >= bridgeLength) {
				if (hasNewTools && currentBatch.length > 0) {
					pushPendingBatch(pruneState, batchTurnIndex, currentBatch, batchContext);
				}
				currentBatch = [];
				batchContext = undefined;
				inToolSequence = false;
				hasNewTools = false;
			}
			if (!inToolSequence) {
				// Start new batch
				currentBatch = [];
				batchTurnIndex = entry.turnIndex ?? turnIndex;
				batchContext = callContext;
				inToolSequence = true;
				hasNewTools = false;
			}
			seenToolSequence = true;
			dialogueSinceLastTool = [];
			for (const tc of toolCalls) {
				const id = tc.id ?? tc.name;
				if (id && !skip.has(id)) {
					const existing = currentBatch.find(t => t.id === id);
					if (!existing) {
						currentBatch.push({
							id,
							name: tc.name ?? "unknown",
							turnIndex: batchTurnIndex,
							args: tc.args,
							context: callContext,
						});
						hasNewTools = true;
					}
				}
			}
		} else if ((msg.role === "tool" || msg.role === "toolResult") && currentBatch.length > 0) {
			const tcId = msg.toolCallId ?? msg.tool_call_id;
			if (tcId) {
				const existing = currentBatch.find(t => t.id === tcId);
				if (existing && !existing.result) {
					existing.result = toolResultText(msg);
				}
			}
		} else if (msg.role === "user" && inToolSequence) {
			// End of tool call sequence
			if (hasNewTools && currentBatch.length > 0) {
				pushPendingBatch(pruneState, batchTurnIndex, currentBatch, batchContext);
			}
			currentBatch = [];
			batchContext = undefined;
			inToolSequence = false;
			const context = extractMessageContext(msg);
			if (context) dialogueSinceLastTool.push(`user: ${context}`);
		} else if (msg.role === "user" || msg.role === "assistant") {
			const context = extractMessageContext(msg);
			if (context) dialogueSinceLastTool.push(`${msg.role}: ${context}`);
		}
	}

	// Flush any pending batch
	if (inToolSequence && hasNewTools && currentBatch.length > 0) {
		pushPendingBatch(pruneState, batchTurnIndex, currentBatch, batchContext);
	}
}

/**
 * Check if pruning should trigger based on current mode and state.
 */
export function shouldTriggerPrune(
	mode: string,
	batchStepCounter: number,
	minTurns: number,
	hasTools: boolean,
	_lastAssistantPureText = false,
): boolean {
	switch (mode) {
		case "every-turn":
			return hasTools;
		case "agent-message":
			return batchStepCounter >= minTurns;
		case "checkpoint":
			return false; // triggered by context_checkpoint only
		case "on-demand":
			return false;
		case "agentic-auto":
			return hasTools && batchStepCounter >= minTurns;
		default:
			return hasTools;
	}
}

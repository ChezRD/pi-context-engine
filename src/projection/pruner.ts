/**
 * pruneMessages — replaces summarized tool-call blocks with compact assistant summaries.
 * Adapted from pi-context-prune.
 */
import type { ToolCallIndexerInstance } from "./indexer.ts";

function textPart(text: string): Array<{ type: "text"; text: string }> {
	return [{ type: "text", text }];
}

/**
 * Remove ToolResult messages whose toolCallId is in the summarized index.
 * Replace assistant tool-call blocks with one local assistant summary at the
 * original call site, so later context does not keep dangling tool-call shells
 * or recovery lookup chains.
 */
export function pruneMessages(
	messages: any[],
	indexer: ToolCallIndexerInstance,
): any[] {
	const pruned: any[] = [];
	for (const msg of messages) {
		if (msg?.role === "assistant") {
			const toolCalls = extractToolCalls(msg);
			if (toolCalls.length === 0) {
				pruned.push(msg);
				continue;
			}
			const hiddenIds = toolCalls.map((toolCall) => toolCall.id).filter((id) => id && indexer.isSummarized(id));
			if (hiddenIds.length === 0) {
				pruned.push(msg);
				continue;
			}
			const summaries = Array.from(new Set(hiddenIds
				.map((id) => indexer.getRecord(id)?.summaryText?.trim())
				.filter(Boolean))) as string[];
			if (summaries.length > 0) {
				pruned.push({
					role: "assistant",
					content: textPart(summaries.join("\n\n")),
					timestamp: msg.timestamp,
				});
			}
			const remaining = filterRemainingToolCalls(msg, new Set(hiddenIds));
			if (remaining) pruned.push(remaining);
			continue;
		}
		if (msg?.role === "tool" || msg?.role === "toolResult") {
			const id = msg.toolCallId ?? msg.tool_call_id;
			if (id && indexer.isSummarized(id)) continue;
		}
		pruned.push(msg);
	}
	return pruned;
}

function extractToolCalls(msg: any): Array<{ id: string }> {
	if (Array.isArray(msg?.tool_calls)) {
		return msg.tool_calls
			.map((toolCall: any) => ({ id: toolCall?.id ?? toolCall?.function?.name ?? toolCall?.name }))
			.filter((toolCall: any) => toolCall.id);
	}
	if (!Array.isArray(msg?.content)) return [];
	return msg.content
		.filter((part: any) => part?.type === "toolCall" || part?.type === "tool_use")
		.map((part: any) => ({ id: part?.id ?? part?.toolCallId ?? part?.callId ?? part?.name }))
		.filter((toolCall: any) => toolCall.id);
}

function filterRemainingToolCalls(msg: any, hiddenIds: Set<string>): any | null {
	let changed = false;
	const clone: any = { ...msg };
	if (Array.isArray(msg?.tool_calls)) {
		clone.tool_calls = msg.tool_calls.filter((toolCall: any) => {
			const id = toolCall?.id ?? toolCall?.function?.name ?? toolCall?.name;
			const keep = !id || !hiddenIds.has(id);
			if (!keep) changed = true;
			return keep;
		});
		if (clone.tool_calls.length === 0) delete clone.tool_calls;
	}
	if (Array.isArray(msg?.content)) {
		clone.content = msg.content.filter((part: any) => {
			if (part?.type !== "toolCall" && part?.type !== "tool_use") return true;
			const id = part?.id ?? part?.toolCallId ?? part?.callId ?? part?.name;
			const keep = !id || !hiddenIds.has(id);
			if (!keep) changed = true;
			return keep;
		});
		if (clone.content.length === 0) delete clone.content;
	}
	if (!changed) return msg;
	const hasRemainingCalls = extractToolCalls(clone).length > 0;
	if (!hasRemainingCalls) return null;
	const hasRemainingContent = typeof clone.content === "string" ? clone.content.trim().length > 0 : Array.isArray(clone.content) && clone.content.length > 0;
	return hasRemainingContent ? clone : null;
}

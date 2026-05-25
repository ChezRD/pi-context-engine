/**
 * pruneMessages — filters summarized toolResult messages from context.
 * Adapted from pi-context-prune.
 */
import type { ToolCallIndexerInstance } from "./indexer.ts";

function messageToolCallIds(msg: any): string[] {
	if (!msg || msg.role !== "assistant") return [];
	const toolCalls = Array.isArray(msg.tool_calls)
		? msg.tool_calls
		: Array.isArray(msg.toolCalls)
			? msg.toolCalls
			: Array.isArray(msg.content)
				? msg.content.filter((part: any) => part?.type === "toolCall" || part?.type === "tool_use")
				: [];
	return toolCalls
		.map((tc: any) => tc?.id ?? tc?.toolCallId ?? tc?.tool_call_id ?? tc?.callId)
		.filter(Boolean);
}

function summarizedResultText(msg: any, indexer: ToolCallIndexerInstance): string | undefined {
	if (msg?.role !== "tool" && msg?.role !== "toolResult") return undefined;
	const id = msg.toolCallId ?? msg.tool_call_id;
	return id && indexer.isSummarized(id) ? (indexer.getRecord(id)?.summaryText ?? "") : undefined;
}

function summarizedAssistantTexts(msg: any, indexer: ToolCallIndexerInstance): string[] {
	if (msg?.role !== "assistant") return [];
	const ids = messageToolCallIds(msg);
	if (ids.length === 0 || ids.some((id) => !indexer.isSummarized(id))) return [];
	return Array.from(new Set(ids
		.map((id) => indexer.getRecord(id)?.summaryText?.trim())
		.filter((summary): summary is string => Boolean(summary))));
}

/**
 * Remove ToolResult messages whose toolCallId is in the summarized index.
 * Keep ALL other messages (assistant tool-call blocks, user messages, etc.).
 */
export function pruneMessages(
	messages: any[],
	indexer: ToolCallIndexerInstance,
): any[] {
	const pruned: any[] = [];
	const insertedAtCallSite = new Set<string>();
	let pendingOrphanSummaries: string[] = [];

	const flushPendingOrphans = (): void => {
		if (pendingOrphanSummaries.length === 0) return;
		const text = Array.from(new Set(pendingOrphanSummaries.map((summary) => summary.trim()).filter(Boolean))).join("\n\n");
		if (text) {
			pruned.push({
				role: "assistant",
				content: `[Pruned tool-result summary]\n${text}`,
			});
		}
		pendingOrphanSummaries = [];
	};

	for (const msg of messages) {
		const assistantSummaries = summarizedAssistantTexts(msg, indexer);
		if (assistantSummaries.length > 0) {
			flushPendingOrphans();
			const fresh = assistantSummaries.filter((summary) => !insertedAtCallSite.has(summary));
			for (const summary of fresh) insertedAtCallSite.add(summary);
			if (fresh.length > 0) {
				pruned.push({
					role: "assistant",
					content: `[Pruned tool-result summary]\n${fresh.join("\n\n")}`,
				});
			}
			continue;
		}

		const resultSummary = summarizedResultText(msg, indexer);
		if (resultSummary !== undefined) {
			if (resultSummary && !insertedAtCallSite.has(resultSummary)) pendingOrphanSummaries.push(resultSummary);
			continue;
		}

		flushPendingOrphans();
		pruned.push(msg);
	}

	flushPendingOrphans();
	return pruned;
}

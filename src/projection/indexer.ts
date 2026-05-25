/**
 * ToolCallIndexer — tracks which tool calls have been summarized.
 * Simplified port from pi-context-prune. In-memory only, no session persistence.
 */
import type { ToolCallRecord } from "./types.ts";

export function createToolCallIndexer() {
	const index = new Map<string, ToolCallRecord>();

	return {
		isSummarized(toolCallId: string): boolean {
			return index.has(toolCallId) && index.get(toolCallId)!.summarized;
		},

		markSummarized(toolCallId: string, toolName: string, turnIndex: number, summaryText?: string): void {
			index.set(toolCallId, { toolCallId, toolName, turnIndex, summarized: true, summaryText });
		},

		getRecord(toolCallId: string): ToolCallRecord | undefined {
			return index.get(toolCallId);
		},

		getAllSummarized(): ToolCallRecord[] {
			return Array.from(index.values()).filter(r => r.summarized);
		},

		reset(): void {
			index.clear();
		},
	};
}

export type ToolCallIndexerInstance = ReturnType<typeof createToolCallIndexer>;

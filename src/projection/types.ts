/** Minimal types for tool pruning. Adapted from pi-context-prune. */

export type PruneOn = "every-turn" | "checkpoint" | "on-demand" | "agent-message" | "agentic-auto";

export interface ToolCallRecord {
	toolCallId: string;
	toolName: string;
	turnIndex: number;
	summarized: boolean;
	summaryText?: string;
}

export interface ToolCallIndexer {
	isSummarized(toolCallId: string): boolean;
	markSummarized(toolCallId: string, toolName: string, turnIndex: number, summaryText?: string): void;
	getRecord(toolCallId: string): ToolCallRecord | undefined;
	getAllSummarized(): ToolCallRecord[];
	reset(): void;
}

export function createToolCallIndexer(): ToolCallIndexer {
	const map = new Map<string, ToolCallRecord>();

	return {
		isSummarized(toolCallId: string): boolean {
			return map.has(toolCallId) && map.get(toolCallId)!.summarized;
		},
		markSummarized(toolCallId: string, toolName: string, turnIndex: number, summaryText?: string): void {
			map.set(toolCallId, { toolCallId, toolName, turnIndex, summarized: true, summaryText });
		},
		getRecord(toolCallId: string): ToolCallRecord | undefined {
			return map.get(toolCallId);
		},
		getAllSummarized(): ToolCallRecord[] {
			return Array.from(map.values()).filter(r => r.summarized);
		},
		reset(): void {
			map.clear();
		},
	};
}

export interface SummarizeResult {
	summaryText: string;
	usage?: { input: number; output: number; cacheRead?: number };
}

export interface SummarizePoolMetrics {
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens?: number;
	cost: number;
	batches: number;
	toolCalls: number;
	rawChars?: number;
	summaryChars?: number;
	modelId?: string;
	error?: string;
}

export interface SummarizePoolResult {
	results: Array<SummarizeResult | null>;
	metrics: SummarizePoolMetrics;
	debug?: {
		prompt: string;
		responseText: string;
		maxTokens: number;
		acceptedSummaries: string[];
	};
}

export interface ToolBatchItem {
	id: string;
	name: string;
	args?: string;
	result?: string;
	context?: string;
	turnIndex?: number;
}

export interface CapturedToolCall extends ToolBatchItem {
	turnIndex: number;
}

export interface ToolBatch {
	turnIndex: number;
	context?: string;
	toolCalls: ToolBatchItem[];
}

export interface CapturedBatch {
	turnIndex: number;
	context?: string;
	toolCalls: CapturedToolCall[];
}

export interface PruneState {
	pendingBatches: CapturedBatch[];
	pendingSummaries: string[];
	summarizedIds: string[];
	skippedOversizedIds?: string[];
	skippedMissingResultIds?: string[];
	batchStepCounter: number;
	checkpointTriggered?: boolean;
	awaitingAgentMessage?: boolean;
}

export interface ToolPruneConfig {
	enabled: boolean;
	pruneOn: PruneOn;
	summarizerModel: string;
	includeContext?: boolean;
	promptOverride?: string;
	carryForwardInventory?: Array<{
		source_ref: string;
		seen_in_prior_request: true;
		observed_offsets: number[];
		total_chars?: number;
		total_bytes?: number;
		subject_hint?: string;
	}>;
}

export const DEFAULT_TOOL_PRUNE_CONFIG: ToolPruneConfig = {
	enabled: true,
	pruneOn: "agent-message",
	summarizerModel: "default",
};

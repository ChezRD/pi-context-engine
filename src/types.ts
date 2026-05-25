import type { ToolIntentState } from "./cache-engine/tool-intent.ts";

export type StatusLevel = "off" | "ok" | "warn" | "danger";

export type DecisionKind = "none" | "warn" | "hold" | "fold" | "aggressive-fold" | "exit-with-summary" | "preflight-fold";

export interface Decision {
	kind: DecisionKind;
	ratio: number;
	ctxUsed: number;
	ctxMax: number;
	tailBudget?: number;
	aggressive?: boolean;
}

export interface FoldBoundary {
	ok: boolean;
	headMessages: any[];
	tailMessages: any[];
	headTokenCount: number;
	tailTokenCount: number;
	totalTokenCount: number;
	tailStartIndex: number;
	reason?: string;
}

export interface PinnedSkill {
	id: string;
	content: string;
}

export type PinnedContextKind = "skill" | "priority" | "user-memory" | "project-memory" | "context-file";

export interface ContextEnginePin {
	kind: PinnedContextKind;
	name: string;
	content: string;
	version?: number;
	priority?: "normal" | "high";
	/** Original XML block (verbatim) */
	raw: string;
}

export interface FoldResult {
	ok: boolean;
	savedContext?: number;
	totalTokens?: number;
	headMessages?: number;
	tailMessages?: number;
	ctxAfterPct?: number;
	reason?: string;
}

export interface ModelCost {
	input?: number;
	cacheRead?: number;
	cacheWrite?: number;
	output?: number;
}

export type CacheCheckpointReason =
	| "session_start"
	| "user_checkpoint"
	| "agent_checkpoint"
	| "rewind"
	| "model_select"
	| "provider_model_drift"
	| "system_drift"
	| "tools_drift"
	| "reasoning_drift"
	| "semantic_fold"
	| "compact"
	| "prune"
	| "pin_drift"
	| "manual_reset";

export interface CacheCheckpoint {
	id: string;
	turn: number;
	createdAt: number;
	reason: CacheCheckpointReason;
	modelId?: string;
	provider?: string;
	prefixHash?: string;
	toolHash?: string;
	previousModelId?: string;
	note?: string;
	conversationEntryId?: string;
	conversationLabel?: string;
	conversationBranchId?: string;
}

export interface CacheSegment {
	id: string;
	checkpointId: string;
	startTurn: number;
	endTurn?: number;
	modelId?: string;
	provider?: string;
	prefixHash?: string;
	toolHash?: string;
	warmupRequests: number;
}

export interface UsageSnapshot {
	turn?: number;
	checkpointId?: string;
	segmentId?: string;
	modelId?: string;
	provider?: string;
	modelCost?: ModelCost;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	totalInput?: number;
	hitRate?: number;
	cost?: number;
	actualCost?: number;
	noCacheCost?: number;
	savings?: number;
	warmup?: boolean;
	checkpointReason?: CacheCheckpointReason;
	requestId?: string;
	createdAt: number;
}

export interface CacheStats {
	requests: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	cost: number;
	savings: number;
	sinceCompactionRequests: number;
	last?: UsageSnapshot;
	usages: UsageSnapshot[];
	compacts: Array<{ turn: number; reason: "auto" | "manual" | "host"; completed: boolean; error?: string }>;
}

export interface DeepSeekDetection {
	kind: "native" | "compatible" | "misconfigured" | "not-deepseek";
	ok: boolean;
	warnings: string[];
	modelId?: string;
	provider?: string;
}

export interface PayloadDiagnostics {
	createdAt: number;
	messageCount: number;
	toolCount: number;
	payloadBytes: number;
	thinkingType?: string;
	reasoningEffort?: string;
	includeUsage?: boolean;
	promptCacheKey?: boolean;
	assistantMessages: number;
	assistantMissingReasoningContent: number;
}

export interface PrunerStatus {
	installed: boolean;
	lookupTool: boolean;
	agenticToolRegistered: boolean;
	agenticToolActive: boolean;
	commands: string[];
	enabled?: boolean;
	pruneOn?: string;
	batchingMode?: string;
	summarizerModel?: string;
	summarizerThinking?: string;
	cacheProfile: "good" | "risky" | "bad";
	cacheProfileReason: string;
}

export type SessionMapNodeKind = "message" | "tool-call" | "tool-result" | "summary" | "custom";

export type SessionMapSegmentKind = "dialogue" | "tool-batch" | "summary" | "custom";

export interface SessionMapNode {
	id: string;
	entryId?: string;
	turnIndex: number;
	role?: string;
	kind: SessionMapNodeKind;
	textPreview?: string;
	toolCallId?: string;
	toolName?: string;
	parentNodeId?: string;
	contentHash?: string;
	argsHash?: string;
	resultHash?: string;
	ref?: string;
	offset?: number;
	limit?: number;
	path?: string;
	hasUnfetchedTail?: boolean;
	summarized?: boolean;
	dropCandidate?: boolean;
}

export interface SessionMapSegment {
	id: string;
	turnIndex: number;
	kind: SessionMapSegmentKind;
	nodeIds: string[];
	dropCandidate?: boolean;
	summary?: string;
	risk?: "low" | "medium" | "high";
	facts?: {
		refs: string[];
		paths: string[];
		hasUnfetchedTail: boolean;
		toolNames: string[];
	};
	reason?: string;
}

export interface SessionPruneSuggestion {
	dropSegmentIds: string[];
	reason?: string;
}

export interface SessionPruneSuggestionValidation {
	acceptedSegmentIds: string[];
	rejected: Array<{
		id: string;
		reason: "unknown-segment" | "contains-user-message" | "not-drop-candidate" | "pending-tool-call" | "current-tail";
	}>;
}

export interface SessionContentMap {
	version: 1;
	builtAt: number;
	nodes: SessionMapNode[];
	segments: SessionMapSegment[];
	totals: {
		messages: number;
		toolCalls: number;
		toolResults: number;
		lookups: number;
		summarized: number;
		dropCandidates: number;
	};
}

export interface AuxiliaryModelUsage {
	modelId: string;
	provider?: string;
	requests: number;
	inputTokens: number;
	cacheReadTokens: number;
	outputTokens: number;
	cost: number;
}

export interface ContextRecommendation {
	percent?: number;
	level: StatusLevel;
	message: string;
}

export interface AppendOnlyProjectionState {
	enabled: boolean;
	projectionActive: boolean;
	stableSummary?: any;
	tailStartEntryId?: string;
	tailFingerprint?: string;
	invalidatedReason?: string;
}

export interface PendingRewind {
	targetId: string;
	newBranchId: string;
	summaryMsg: string;
}

export interface PruneState {
	pendingBatches: Array<{
		turnIndex: number;
		context?: string;
		toolCalls: Array<{
			id: string;
			name: string;
			turnIndex: number;
			args?: string;
			result?: string;
			context?: string;
		}>;
	}>;
	pendingSummaries: string[];
	summarizedIds: string[];
	skippedOversizedIds?: string[];
	skippedMissingResultIds?: string[];
	summarizedRecords?: Array<{
		toolCallId: string;
		toolName: string;
		turnIndex: number;
		summarized: boolean;
		summaryText?: string;
	}>;
	appliedIds: string[];
	pruneRunCount: number;
	batchStepCounter: number;
	checkpointTriggered?: boolean;
	awaitingAgentMessage?: boolean;
	isFlushing?: boolean;
	awaitingImpact?: {
		turn: number;
		appliedIds: string[];
	};
	sessionMap?: SessionContentMap;
	impact: {
		summarizeRequests: number;
		summarizeInputTokens: number;
		summarizeOutputTokens: number;
		summarizeCost: number;
		summarizeToolCalls: number;
		summarizeRawChars?: number;
		summarizeSummaryChars?: number;
		lastSummarizeCost?: number;
		lastSummarizeToolCalls?: number;
		lastSummarizeRawChars?: number;
		lastSummarizeSummaryChars?: number;
		lastSummarizePrompt?: string;
		lastSummarizeResponse?: string;
		lastAcceptedSummaries?: string[];
		lastSummarizeMaxTokens?: number;
		summarizeCacheReadTokens?: number;
		summarizeByModel?: AuxiliaryModelUsage[];
		postPruneRequests: number;
		postPruneMissTokens: number;
		postPruneCacheReadTokens: number;
		postPruneMissCost: number;
		postPruneLookupRegret?: number;
		postPruneReadRegret?: number;
		postFoldReadRegret?: number;
		pendingBatchesPreservedDuringFlush?: number;
		pendingToolCallsPreservedDuringFlush?: number;
		lastPendingBatchesPreservedDuringFlush?: number;
		lastPendingToolCallsPreservedDuringFlush?: number;
		lastPostPruneHitRate?: number;
		lastPostPruneMissTokens?: number;
		lastPostPruneMissCost?: number;
		lastRebuildSourceMessages?: number;
		lastRebuildOutputMessages?: number;
		lastRebuildPrunableIds?: number;
		lastRebuildNewlyApplied?: number;
		lastRebuildCheckpointOpened?: boolean;
		lastRebuildSavedApproxChars?: number;
		lastRebuildReason?: string;
		lastError?: string;
	};
}

export interface BranchingState {
	pendingRewind: PendingRewind | null;
}

export interface SemanticFoldState {
	active: boolean;
	foldedThisTurn: boolean;
	syntheticMsg?: any;
	tailStartEntryId?: string | null;
}

export interface CacheEngineState {
	turnIndex: number;
	checkpoints: CacheCheckpoint[];
	segments: CacheSegment[];
	currentSegmentId?: string;
	lastProviderModelId?: string;
	lastProviderPrefixHash?: string;
	pendingUsageModelId?: string;
	pendingUsageProvider?: string;
	semanticFold: SemanticFoldState;
	prune: PruneState;
	branching: BranchingState;
	prefixFingerprint?: string;
	prefixHash?: string;
	toolHash?: string;
	prefixDriftCount: number;
	toolHashChanges: number;
	lastPrefixChangeTurn?: number;
	lastPrefixChangeReason?: string;
	lastPrefixWarningTurn?: number;
	lastPrefixWarningReason?: string;
	lastPrefixNotificationSuppressed: boolean;
	historyFingerprint?: string;
	historyRewriteCount: number;
	lastWarning?: string;
	lastAutoCompactAt?: number;
	lastCompactTurn?: number;
	compactCount: number;
	autoPrunerAdvised: boolean;
	hostThresholdAdvised: boolean;
	lastDecision?: string;
	lastZone?: string;
	holdUntil?: number;
	holdUntilTurn?: number;
	appendOnly: AppendOnlyProjectionState;
	recentToolCalls: Map<string, number>;
	toolIntent: ToolIntentState;
	foldToolRegistered: boolean;
	lastPinInjectionHash?: string;
}

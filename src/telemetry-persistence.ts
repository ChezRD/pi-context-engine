import type { RuntimeState } from "./runtime-state.ts";
import type { CacheStats, CacheEngineState } from "./types.ts";

export const CUSTOM_TYPE_TELEMETRY = "context-engine-telemetry";
export const CUSTOM_TYPE_PRUNE_DEBUG = "context-engine-prune-debug";

type PersistedTelemetry = {
	version: 1;
	stats: CacheStats;
	engine: Pick<CacheEngineState,
		| "checkpoints"
		| "segments"
		| "currentSegmentId"
		| "lastProviderModelId"
		| "lastProviderPrefixHash"
		| "prefixFingerprint"
		| "prefixHash"
		| "toolHash"
		| "prefixDriftCount"
		| "toolHashChanges"
		| "lastPrefixChangeTurn"
		| "lastPrefixChangeReason"
		| "lastPrefixWarningTurn"
		| "lastPrefixWarningReason"
		| "lastPrefixNotificationSuppressed"
		| "historyRewriteCount"
		| "compactCount"
		| "prune"
	>;
};

export function persistTelemetry(pi: any, state: RuntimeState): void {
	if (typeof pi?.appendEntry !== "function") return;
	const data: PersistedTelemetry = {
		version: 1,
		stats: state.stats,
		engine: {
			checkpoints: state.engine.checkpoints,
			segments: state.engine.segments,
			currentSegmentId: state.engine.currentSegmentId,
			lastProviderModelId: state.engine.lastProviderModelId,
			lastProviderPrefixHash: state.engine.lastProviderPrefixHash,
			prefixFingerprint: state.engine.prefixFingerprint,
			prefixHash: state.engine.prefixHash,
			toolHash: state.engine.toolHash,
			prefixDriftCount: state.engine.prefixDriftCount,
			toolHashChanges: state.engine.toolHashChanges,
			lastPrefixChangeTurn: state.engine.lastPrefixChangeTurn,
			lastPrefixChangeReason: state.engine.lastPrefixChangeReason,
			lastPrefixWarningTurn: state.engine.lastPrefixWarningTurn,
			lastPrefixWarningReason: state.engine.lastPrefixWarningReason,
			lastPrefixNotificationSuppressed: state.engine.lastPrefixNotificationSuppressed,
			historyRewriteCount: state.engine.historyRewriteCount,
			compactCount: state.engine.compactCount,
			prune: state.engine.prune,
		},
	};
	pi.appendEntry(CUSTOM_TYPE_TELEMETRY, data);
}

export function appendPruneDebugEntry(pi: any, data: Record<string, unknown>): void {
	if (typeof pi?.appendEntry !== "function") return;
	pi.appendEntry(CUSTOM_TYPE_PRUNE_DEBUG, { version: 1, ...data });
}

export function restoreTelemetryFromSession(ctx: any, state: RuntimeState): boolean {
	const branch = ctx?.sessionManager?.getEntries?.() ?? ctx?.sessionManager?.getBranch?.() ?? [];
	let latest: PersistedTelemetry | undefined;
	let latestPruneDebug: any | undefined;
	for (const entry of branch) {
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE_TELEMETRY && entry?.data?.version === 1) {
			latest = entry.data as PersistedTelemetry;
		}
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE_PRUNE_DEBUG && entry?.data?.version === 1) {
			latestPruneDebug = entry.data;
		}
	}
	if (!latest) return false;
	state.stats = latest.stats;
	Object.assign(state.engine, latest.engine);
	state.engine.prune.pendingBatches = [];
	state.engine.prune.pendingSummaries = [];
	state.engine.prune.batchStepCounter = 0;
	state.engine.prune.skippedMissingResultIds ??= [];
	state.engine.prune.summarizedRecords ??= [];
	if (state.engine.prune.summarizedRecords.length > 0) {
		state.toolIndexer.reset();
		for (const record of state.engine.prune.summarizedRecords) {
			state.toolIndexer.markSummarized(record.toolCallId, record.toolName, record.turnIndex, record.summaryText);
		}
	}
	if (!state.engine.prune.impact) {
		state.engine.prune.impact = { summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0, summarizeCost: 0, summarizeToolCalls: 0, summarizeRawChars: 0, summarizeSummaryChars: 0, summarizeCacheReadTokens: 0, summarizeByModel: [], postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0, postPruneMissCost: 0, postPruneLookupRegret: 0, postPruneReadRegret: 0, postFoldReadRegret: 0, pendingBatchesPreservedDuringFlush: 0, pendingToolCallsPreservedDuringFlush: 0, lastPendingBatchesPreservedDuringFlush: 0, lastPendingToolCallsPreservedDuringFlush: 0 };
	}
	state.engine.prune.impact.summarizeCacheReadTokens ??= 0;
	state.engine.prune.impact.summarizeByModel ??= [];
	state.engine.prune.impact.postPruneLookupRegret ??= 0;
	state.engine.prune.impact.postPruneReadRegret ??= 0;
	state.engine.prune.impact.postFoldReadRegret ??= 0;
	state.engine.prune.impact.pendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.pendingToolCallsPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingToolCallsPreservedDuringFlush ??= 0;
	if (latestPruneDebug) {
		state.engine.prune.impact.lastSummarizePrompt ??= latestPruneDebug.prompt;
		state.engine.prune.impact.lastSummarizeResponse ??= latestPruneDebug.response;
		state.engine.prune.impact.lastAcceptedSummaries ??= latestPruneDebug.acceptedSummaries;
		state.engine.prune.impact.lastSummarizeMaxTokens ??= latestPruneDebug.maxTokens;
		state.engine.prune.impact.lastErrorKey ??= latestPruneDebug.errorKey;
	}
	return true;
}

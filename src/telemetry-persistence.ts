import type { RuntimeState } from "./runtime-state.ts";
import type { CacheStats, CacheEngineState, PruneState } from "./types.ts";
import { safeAppendEntry } from "./stale-context.ts";

export const CUSTOM_TYPE_TELEMETRY = "context-engine-telemetry";
export const CUSTOM_TYPE_PRUNE_DEBUG = "context-engine-prune-debug";

const MAX_PERSISTED_USAGES = 250;
const MAX_PERSISTED_COMPACTS = 80;
const MAX_PERSISTED_IDS = 2000;
const MAX_PERSISTED_RECORDS = 500;
const MAX_PERSISTED_SUMMARY_CHARS = 1200;
const MAX_DEBUG_TEXT_CHARS = 20000;
const MAX_DEBUG_SUMMARIES = 40;
const MAX_DEBUG_SUMMARY_CHARS = 3000;

type PersistedPruneImpact = Omit<PruneState["impact"],
	"lastSummarizePrompt" | "lastSummarizeResponse" | "lastAcceptedSummaries"
>;

type PersistedPruneState = Pick<PruneState,
	| "summarizedIds"
	| "skippedOversizedIds"
	| "skippedMissingResultIds"
	| "summarizedRecords"
	| "appliedIds"
	| "pruneRunCount"
	| "batchStepCounter"
	| "checkpointTriggered"
	| "awaitingAgentMessage"
	| "awaitingImpact"
> & {
	impact: PersistedPruneImpact;
};

type PersistedEngine = Omit<Pick<CacheEngineState,
	| "checkpoints"
	| "segments"
	| "currentSegmentId"
	| "lastProviderModelId"
	| "lastProviderPrefixHash"
	| "providerRequestCount"
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
>, "prune"> & {
	prune: PersistedPruneState;
};

type PersistedTelemetry = {
	version: 1;
	stats: CacheStats;
	engine: PersistedEngine;
	lastPayload?: RuntimeState["lastPayload"];
};

function tail<T>(items: T[] | undefined, max: number): T[] {
	return (items ?? []).slice(-max);
}

function truncateText(value: string | undefined, max: number): string | undefined {
	if (value === undefined || value.length <= max) return value;
	return `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}

function compactStats(stats: CacheStats): CacheStats {
	return {
		...stats,
		usages: tail(stats.usages, MAX_PERSISTED_USAGES),
		compacts: tail(stats.compacts, MAX_PERSISTED_COMPACTS),
	};
}

function compactPruneImpact(impact: PruneState["impact"]): PersistedPruneImpact {
	const { lastSummarizePrompt, lastSummarizeResponse, lastAcceptedSummaries, ...compact } = impact;
	return compact;
}

function compactPruneState(prune: PruneState): PersistedPruneState {
	return {
		summarizedIds: tail(prune.summarizedIds, MAX_PERSISTED_IDS),
		skippedOversizedIds: tail(prune.skippedOversizedIds, MAX_PERSISTED_IDS),
		skippedMissingResultIds: tail(prune.skippedMissingResultIds, MAX_PERSISTED_IDS),
		summarizedRecords: tail(prune.summarizedRecords, MAX_PERSISTED_RECORDS).map((record) => ({
			...record,
			summaryText: truncateText(record.summaryText, MAX_PERSISTED_SUMMARY_CHARS),
		})),
		appliedIds: tail(prune.appliedIds, MAX_PERSISTED_IDS),
		pruneRunCount: prune.pruneRunCount,
		batchStepCounter: prune.batchStepCounter,
		checkpointTriggered: prune.checkpointTriggered,
		awaitingAgentMessage: prune.awaitingAgentMessage,
		awaitingImpact: prune.awaitingImpact ? { ...prune.awaitingImpact, appliedIds: tail(prune.awaitingImpact.appliedIds, MAX_PERSISTED_IDS) } : undefined,
		impact: compactPruneImpact(prune.impact),
	};
}

function compactDebugData(data: Record<string, unknown>): Record<string, unknown> {
	return {
		...data,
		prompt: typeof data.prompt === "string" ? truncateText(data.prompt, MAX_DEBUG_TEXT_CHARS) : data.prompt,
		response: typeof data.response === "string" ? truncateText(data.response, MAX_DEBUG_TEXT_CHARS) : data.response,
		acceptedSummaries: Array.isArray(data.acceptedSummaries)
			? data.acceptedSummaries.slice(0, MAX_DEBUG_SUMMARIES).map((summary) => typeof summary === "string" ? truncateText(summary, MAX_DEBUG_SUMMARY_CHARS) : summary)
			: data.acceptedSummaries,
	};
}

export function persistTelemetry(pi: any, state: RuntimeState): void {
	if (typeof pi?.appendEntry !== "function") return;
	const data: PersistedTelemetry = {
		version: 1,
		stats: compactStats(state.stats),
		engine: {
			checkpoints: state.engine.checkpoints,
			segments: state.engine.segments,
			currentSegmentId: state.engine.currentSegmentId,
			lastProviderModelId: state.engine.lastProviderModelId,
			lastProviderPrefixHash: state.engine.lastProviderPrefixHash,
			providerRequestCount: state.engine.providerRequestCount,
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
			prune: compactPruneState(state.engine.prune),
		},
		lastPayload: state.lastPayload,
	};
	safeAppendEntry(pi, CUSTOM_TYPE_TELEMETRY, data);
}

export function appendPruneDebugEntry(pi: any, data: Record<string, unknown>): void {
	safeAppendEntry(pi, CUSTOM_TYPE_PRUNE_DEBUG, { version: 1, ...compactDebugData(data) });
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
	const defaultPrune = state.engine.prune;
	Object.assign(state.engine, latest.engine);
	state.engine.prune = {
		...defaultPrune,
		...latest.engine.prune,
		impact: {
			...defaultPrune.impact,
			...latest.engine.prune?.impact,
		},
	};
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
	state.engine.prune.impact.summarizeCacheReadTokens ??= 0;
	state.engine.prune.impact.summarizeByModel ??= [];
	state.engine.prune.impact.postPruneLookupRegret ??= 0;
	state.engine.prune.impact.postPruneReadRegret ??= 0;
	state.engine.prune.impact.postFoldReadRegret ??= 0;
	state.engine.prune.impact.pendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.pendingToolCallsPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingBatchesPreservedDuringFlush ??= 0;
	state.engine.prune.impact.lastPendingToolCallsPreservedDuringFlush ??= 0;
	state.engine.prune.impact.noOpToolCalls ??= 0;
	state.engine.prune.impact.lastNoOpToolCalls ??= 0;
	if ((state.engine.prune.impact.lastRebuildNewlyApplied ?? 0) === 0) {
		state.engine.prune.impact.lastRebuildSavedApproxChars = 0;
	}
	if (latestPruneDebug) {
		state.engine.prune.impact.lastSummarizePrompt ??= latestPruneDebug.prompt;
		state.engine.prune.impact.lastSummarizeResponse ??= latestPruneDebug.response;
		state.engine.prune.impact.lastAcceptedSummaries ??= latestPruneDebug.acceptedSummaries;
		state.engine.prune.impact.lastSummarizeMaxTokens ??= latestPruneDebug.maxTokens;
		state.engine.prune.impact.lastErrorKey ??= latestPruneDebug.errorKey;
	}
	return true;
}

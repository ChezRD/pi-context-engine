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
	for (const entry of branch) {
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE_TELEMETRY && entry?.data?.version === 1) {
			latest = entry.data as PersistedTelemetry;
		}
	}
	if (!latest) return false;
	state.stats = latest.stats;
	Object.assign(state.engine, latest.engine);
	state.engine.prune.pendingSummaries = [];
	state.engine.prune.summarizedRecords ??= [];
	if (state.engine.prune.summarizedRecords.length > 0) {
		state.toolIndexer.reset();
		for (const record of state.engine.prune.summarizedRecords) {
			state.toolIndexer.markSummarized(record.toolCallId, record.toolName, record.turnIndex, record.summaryText);
		}
	}
	if (!state.engine.prune.impact) {
		state.engine.prune.impact = { summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0, summarizeCost: 0, summarizeToolCalls: 0, summarizeRawChars: 0, summarizeSummaryChars: 0, postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0, postPruneMissCost: 0 };
	}
	return true;
}

import type { RuntimeState } from "../runtime-state.ts";
import type { CacheCheckpoint, CacheCheckpointReason, CacheSegment, UsageSnapshot } from "../types.ts";
import type { CanonicalPrefix, PrefixDrift } from "./prefix-fingerprint.ts";

function checkpointId(index: number): string {
	return `checkpoint-${index}`;
}

function segmentId(index: number): string {
	return `segment-${index}`;
}

function currentCheckpoint(state: RuntimeState): CacheCheckpoint | undefined {
	if (!state.engine.checkpoints) state.engine.checkpoints = [];
	return state.engine.checkpoints[state.engine.checkpoints.length - 1];
}

function startsSegmentByDefault(reason: CacheCheckpointReason): boolean {
	return reason === "session_start"
		|| reason === "provider_model_drift"
		|| reason === "model_select"
		|| reason === "system_drift"
		|| reason === "tools_drift"
		|| reason === "semantic_fold"
		|| reason === "compact"
		|| reason === "prune"
		|| reason === "manual_reset"
		|| reason === "rewind";
}

function shouldStartSegment(state: RuntimeState, reason: CacheCheckpointReason, details?: Partial<CacheCheckpoint> & { startSegment?: boolean }): boolean {
	if (typeof details?.startSegment === "boolean") return details.startSegment;
	if (reason === "user_checkpoint" || reason === "agent_checkpoint") return state.config.checkpointStartsSegment;
	return startsSegmentByDefault(reason);
}

function openSegment(state: RuntimeState, checkpoint: CacheCheckpoint): CacheSegment {
	if (!state.engine.segments) state.engine.segments = [];
	const previous = state.engine.currentSegmentId ? state.engine.segments.find((segment) => segment.id === state.engine.currentSegmentId) : undefined;
	if (previous && previous.endTurn === undefined) previous.endTurn = state.engine.turnIndex;
	const segment: CacheSegment = {
		id: segmentId(state.engine.segments.length + 1),
		checkpointId: checkpoint.id,
		startTurn: state.engine.turnIndex,
		modelId: checkpoint.modelId,
		provider: checkpoint.provider,
		prefixHash: checkpoint.prefixHash,
		toolHash: checkpoint.toolHash,
		warmupRequests: 0,
	};
	state.engine.segments.push(segment);
	state.engine.currentSegmentId = segment.id;
	return segment;
}

export function openCacheCheckpoint(
	state: RuntimeState,
	reason: CacheCheckpointReason,
	details?: Partial<CacheCheckpoint> & { startSegment?: boolean },
): CacheCheckpoint {
	if (!state.engine.checkpoints) state.engine.checkpoints = [];
	const checkpoint: CacheCheckpoint = {
		id: checkpointId(state.engine.checkpoints.length + 1),
		turn: state.engine.turnIndex,
		createdAt: Date.now(),
		reason,
		modelId: details?.modelId ?? state.engine.lastProviderModelId ?? state.detection?.modelId,
		provider: details?.provider ?? state.detection?.provider,
		prefixHash: details?.prefixHash ?? state.engine.prefixHash,
		toolHash: details?.toolHash ?? state.engine.toolHash,
		previousModelId: details?.previousModelId,
		note: details?.note,
		conversationEntryId: details?.conversationEntryId,
		conversationLabel: details?.conversationLabel,
		conversationBranchId: details?.conversationBranchId,
	};
	state.engine.checkpoints.push(checkpoint);
	if (shouldStartSegment(state, reason, details)) openSegment(state, checkpoint);
	return checkpoint;
}

export function currentCacheSegment(state: RuntimeState): CacheSegment {
	const existing = state.engine.currentSegmentId ? state.engine.segments.find((segment) => segment.id === state.engine.currentSegmentId) : undefined;
	if (existing) return existing;
	const checkpoint = currentCheckpoint(state) ?? openCacheCheckpoint(state, "session_start", { startSegment: false });
	return openSegment(state, checkpoint);
}

export function annotateUsageForCurrentSegment(state: RuntimeState, snapshot: UsageSnapshot): UsageSnapshot {
	const segment = currentCacheSegment(state);
	const checkpoint = state.engine.checkpoints.find((item) => item.id === segment.checkpointId);
	const warmup = segment.warmupRequests === 0;
	segment.warmupRequests++;
	return {
		...snapshot,
		checkpointId: segment.checkpointId,
		segmentId: segment.id,
		modelId: snapshot.modelId ?? segment.modelId ?? state.engine.lastProviderModelId ?? state.detection.modelId,
		provider: snapshot.provider ?? segment.provider ?? state.detection?.provider,
		warmup: snapshot.warmup ?? warmup,
		checkpointReason: snapshot.checkpointReason ?? checkpoint?.reason,
	};
}

function checkpointReasonForDrift(drift: PrefixDrift): CacheCheckpointReason | undefined {
	if (drift.reasons.includes("model")) return "provider_model_drift";
	if (drift.reasons.includes("system")) return "system_drift";
	if (drift.reasons.includes("tools")) return "tools_drift";
	if (drift.reasons.includes("reasoning")) return "reasoning_drift";
	return undefined;
}

export function handlePrefixCheckpoint(state: RuntimeState, drift: PrefixDrift, nextPrefix: CanonicalPrefix): void {
	const reason = checkpointReasonForDrift(drift);
	if (!reason) return;
	openCacheCheckpoint(state, reason, {
		modelId: nextPrefix.model,
		provider: state.detection.provider,
		prefixHash: state.engine.prefixHash,
		toolHash: nextPrefix.toolsHash,
		previousModelId: state.engine.lastProviderModelId,
		note: drift.reasons.join(", "),
		startSegment: drift.hard,
	});
}

import type { ExtensionConfig } from "./config.ts";
import { readConfig } from "./config.ts";
import { detectDeepSeekModel } from "./model.ts";
import { emptyStats } from "./stats.ts";
import type { CacheEngineState, CacheStats, DeepSeekDetection, PayloadDiagnostics } from "./types.ts";
import { createToolCallIndexer } from "./projection/indexer.ts";
import type { ToolCallIndexerInstance } from "./projection/indexer.ts";
import { openCacheCheckpoint } from "./cache-engine/cache-checkpoints.ts";
import { PinStore } from "./context-pins/store.ts";

export const STATUS_KEY = "context-engine";

export interface RuntimeState {
	config: ExtensionConfig;
	stats: CacheStats;
	detection: DeepSeekDetection;
	lastPayload?: PayloadDiagnostics;
	contextPct?: number;
	dynamicModels: string[];
	lookupRegistered: boolean;
	engine: CacheEngineState;
	toolIndexer: ToolCallIndexerInstance;
	pinStore: PinStore;
}

export function createRuntimeState(ctx?: any): RuntimeState {
	const state: RuntimeState = {
		config: readConfig(),
		stats: emptyStats(),
		detection: detectDeepSeekModel(ctx?.model),
		dynamicModels: [],
		lookupRegistered: false,
		engine: { turnIndex: 0, checkpoints: [], segments: [], prefixDriftCount: 0, toolHashChanges: 0, historyRewriteCount: 0, compactCount: 0, lastPrefixNotificationSuppressed: false, autoPrunerAdvised: false, hostThresholdAdvised: false, appendOnly: { enabled: false, projectionActive: false }, recentToolCalls: new Map(), foldToolRegistered: false, semanticFold: { active: false, foldedThisTurn: false }, prune: { pendingBatches: [], pendingSummaries: [], summarizedIds: [], skippedOversizedIds: [], skippedMissingResultIds: [], summarizedRecords: [], appliedIds: [], pruneRunCount: 0, batchStepCounter: 0, impact: { summarizeRequests: 0, summarizeInputTokens: 0, summarizeOutputTokens: 0, summarizeCost: 0, summarizeToolCalls: 0, summarizeRawChars: 0, summarizeSummaryChars: 0, summarizeCacheReadTokens: 0, summarizeByModel: [], postPruneRequests: 0, postPruneMissTokens: 0, postPruneCacheReadTokens: 0, postPruneMissCost: 0 } }, branching: { pendingRewind: null } },
		toolIndexer: createToolCallIndexer(),
		pinStore: new PinStore(),
	};
	openCacheCheckpoint(state, "session_start", { modelId: state.detection.modelId, provider: state.detection.provider });
	return state;
}

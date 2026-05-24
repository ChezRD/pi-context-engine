import type { ExtensionConfig } from "./config.ts";
import { readConfig } from "./config.ts";
import { detectDeepSeekModel } from "./model.ts";
import { emptyStats } from "./stats.ts";
import type { CacheEngineState, CacheStats, DeepSeekDetection, PayloadDiagnostics } from "./types.ts";

export const STATUS_KEY = "deepseek-cache";

export interface RuntimeState {
	config: ExtensionConfig;
	stats: CacheStats;
	detection: DeepSeekDetection;
	lastPayload?: PayloadDiagnostics;
	contextPct?: number;
	dynamicModels: string[];
	lookupRegistered: boolean;
	engine: CacheEngineState;
}

export function createRuntimeState(ctx?: any): RuntimeState {
	return {
		config: readConfig(),
		stats: emptyStats(),
		detection: detectDeepSeekModel(ctx?.model),
		dynamicModels: [],
		lookupRegistered: false,
		engine: { turnIndex: 0, prefixDriftCount: 0, toolHashChanges: 0, historyRewriteCount: 0, compactCount: 0, lastPrefixNotificationSuppressed: false, autoPrunerAdvised: false, hostThresholdAdvised: false, appendOnly: { enabled: false, projectionActive: false }, recentToolCalls: new Map(), foldToolRegistered: false },
	};
}

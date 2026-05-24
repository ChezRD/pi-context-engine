export type StatusLevel = "off" | "ok" | "warn" | "danger";

export interface UsageSnapshot {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	cost?: number;
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
	sinceCompactionRequests: number;
	last?: UsageSnapshot;
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
	agenticTool: boolean;
	commands: string[];
	recommendations: string[];
}

export interface ContextRecommendation {
	percent?: number;
	level: StatusLevel;
	message: string;
}

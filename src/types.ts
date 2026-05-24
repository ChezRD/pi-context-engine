export type StatusLevel = "off" | "ok" | "warn" | "danger";

export interface UsageSnapshot {
	turn?: number;
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	totalInput?: number;
	hitRate?: number;
	cost?: number;
	savings?: number;
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

export interface CacheEngineState {
	turnIndex: number;
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
	foldToolRegistered: boolean;
}

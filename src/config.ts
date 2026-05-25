import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface ExtensionConfig {
	enabled: boolean;
	diagnostics: boolean;
	mutateSystemPrompt: boolean;
	mutateProviderPayload: boolean;
	registerDynamicProvider: boolean;
	dynamicProviderName: string;
	deepseekBaseUrl: string;
	deepseekApiKeyEnv: string;
	allowOverrideBuiltInDeepSeek: boolean;
	hugeResultCapper: boolean;
	hugeResultChars: number;
	hugeResultHeadChars: number;
	hugeResultTailChars: number;
	prefixStabilityCheck: boolean;
	prefixFingerprint: boolean;
	toolFingerprint: boolean;
	appendOnlyProjection: boolean;
	autoCompactAtHighWatermark: boolean;
	enableAgenticTools: boolean;
	pruneEnabled: boolean;
	pruneOn: string;
	pruneModel: string;
	pruneIncludeContext: boolean;
	pruneBatchSize: number;
	pruneBridgeLength: number;
	statusBarStyle: "blocks" | "sparkline" | "text";
	autoFold: boolean;
	foldTailPct: number;
	foldSummaryModel: string;
	foldTool: boolean;
	cachePromptInjection: boolean;
	showCostSavings: boolean;
	showCostBreakdown: boolean;
	showSavings: boolean;
	strictPrefixWarnings: boolean;
	parallelReadTool: boolean;
	contextWarnPct: number;
	contextDangerPct: number;
	contextCompactPct: number;
	contextForceFoldPct: number;
	foldHitRateThreshold: number;
	adviseCompactHitRateThreshold: number;
	showTurnEstimate: boolean;
	minTurnsBetweenCompacts: number;
	maxCompactsPerSession: number;
	statusLine: boolean;
	persistDiagnostics: boolean;
	// Semantic fold thresholds
	foldThreshold: number;
	aggressiveFoldThreshold: number;
	exitSummaryThreshold: number;
	preflightFoldThreshold: number;
	aggressiveFoldTailPct: number;
	minFoldSavings: number;
	foldTimeoutMs: number;
	semanticFoldMarker: string;
	checkpointStartsSegment: boolean;
	// Pin/memory injection
	skillPinning: boolean;
	memoryInjection: boolean;
	priorityInjection: boolean;
	reasonixCompatibilityRoots: boolean;
	autoDetectSkillPins: boolean;
	autoPinFrequentSkills: boolean;
	skillPinConfirmThreshold: number;
}

export const CONFIG_BASENAME = "context-engine.json";

export const DEFAULT_CONFIG: ExtensionConfig = {
	enabled: true,
	diagnostics: true,
	mutateSystemPrompt: false,
	mutateProviderPayload: false,
	registerDynamicProvider: false,
	dynamicProviderName: "context-engine-provider",
	deepseekBaseUrl: "https://api.deepseek.com",
	deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
	allowOverrideBuiltInDeepSeek: false,
	hugeResultCapper: true,
	hugeResultChars: 12_000,
	hugeResultHeadChars: 1_200,
	hugeResultTailChars: 400,
	prefixStabilityCheck: true,
	prefixFingerprint: true,
	toolFingerprint: true,
	appendOnlyProjection: true,
	autoCompactAtHighWatermark: false,
	autoFold: true,
	foldTailPct: 0.20,
	foldSummaryModel: "deepseek-v4-flash",
	foldTool: false,
	cachePromptInjection: true,
	showCostSavings: true,
	showCostBreakdown: true,
	showSavings: true,
	strictPrefixWarnings: false,
	parallelReadTool: false,
	contextWarnPct: 0.60,
	contextDangerPct: 0.72,
	contextCompactPct: 0.82,
	contextForceFoldPct: 0.95,
	foldHitRateThreshold: 0.85,
	adviseCompactHitRateThreshold: 0.80,
	showTurnEstimate: true,
	minTurnsBetweenCompacts: 3,
	maxCompactsPerSession: 6,
	statusLine: true,
	persistDiagnostics: false,
	enableAgenticTools: true,
	pruneEnabled: true,
	pruneOn: "agent-message",
	pruneModel: "deepseek-v4-flash",
	pruneIncludeContext: false,
	pruneBatchSize: 5,
	pruneBridgeLength: 2,
	statusBarStyle: "sparkline",
	foldThreshold: 0.75,
	aggressiveFoldThreshold: 0.78,
	exitSummaryThreshold: 0.80,
	preflightFoldThreshold: 0.90,
	aggressiveFoldTailPct: 0.10,
	minFoldSavings: 0.30,
	foldTimeoutMs: 15_000,
	semanticFoldMarker: "<fold-summary>",
	checkpointStartsSegment: false,
	skillPinning: true,
	memoryInjection: false,
	priorityInjection: true,
	reasonixCompatibilityRoots: false,
	autoDetectSkillPins: true,
	autoPinFrequentSkills: false,
	skillPinConfirmThreshold: 2,
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function pruneMode(value: unknown, fallback: string): string {
	const normalized = str(value, fallback);
	return ["every-turn", "checkpoint", "on-demand", "agent-message", "agentic-auto"].includes(normalized) ? normalized : fallback;
}

function num(value: unknown, fallback: number, min = 0): number {
	return typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;
}

function intRange(value: unknown, fallback: number, min: number, max: number): number {
	const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return Math.max(min, Math.min(max, Math.round(n)));
}

function pct(value: unknown, fallback: number): number {
	const n = num(value, fallback, 0);
	return n <= 1 ? n : n / 100;
}

export function getConfigPath(): string {
	return join(homedir(), ".pi", "agent", CONFIG_BASENAME);
}

export function parseConfig(value: unknown): ExtensionConfig {
	if (!isObject(value)) return { ...DEFAULT_CONFIG };
	return {
		enabled: bool(value.enabled, DEFAULT_CONFIG.enabled),
		diagnostics: bool(value.diagnostics, DEFAULT_CONFIG.diagnostics),
		mutateSystemPrompt: bool(value.mutateSystemPrompt, DEFAULT_CONFIG.mutateSystemPrompt),
		mutateProviderPayload: bool(value.mutateProviderPayload, DEFAULT_CONFIG.mutateProviderPayload),
		registerDynamicProvider: bool(value.registerDynamicProvider, DEFAULT_CONFIG.registerDynamicProvider),
		dynamicProviderName: str(value.dynamicProviderName, DEFAULT_CONFIG.dynamicProviderName),
		deepseekBaseUrl: str(value.deepseekBaseUrl, DEFAULT_CONFIG.deepseekBaseUrl),
		deepseekApiKeyEnv: str(value.deepseekApiKeyEnv, DEFAULT_CONFIG.deepseekApiKeyEnv),
		allowOverrideBuiltInDeepSeek: bool(value.allowOverrideBuiltInDeepSeek, DEFAULT_CONFIG.allowOverrideBuiltInDeepSeek),
		hugeResultCapper: bool(value.hugeResultCapper, DEFAULT_CONFIG.hugeResultCapper),
		hugeResultChars: num(value.hugeResultChars, DEFAULT_CONFIG.hugeResultChars, 1024),
		hugeResultHeadChars: num(value.hugeResultHeadChars, DEFAULT_CONFIG.hugeResultHeadChars, 0),
		hugeResultTailChars: num(value.hugeResultTailChars, DEFAULT_CONFIG.hugeResultTailChars, 0),
		prefixStabilityCheck: bool(value.prefixStabilityCheck, DEFAULT_CONFIG.prefixStabilityCheck),
		prefixFingerprint: bool(value.prefixFingerprint, DEFAULT_CONFIG.prefixFingerprint),
		toolFingerprint: bool(value.toolFingerprint, DEFAULT_CONFIG.toolFingerprint),
		appendOnlyProjection: bool(value.appendOnlyProjection, DEFAULT_CONFIG.appendOnlyProjection),
		autoCompactAtHighWatermark: bool(value.autoCompactAtHighWatermark, DEFAULT_CONFIG.autoCompactAtHighWatermark),
		autoFold: bool(value.autoFold, DEFAULT_CONFIG.autoFold),
		foldTailPct: pct(value.foldTailPct, DEFAULT_CONFIG.foldTailPct),
		foldSummaryModel: str(value.foldSummaryModel, DEFAULT_CONFIG.foldSummaryModel),
		foldTool: bool(value.foldTool, DEFAULT_CONFIG.foldTool),
		cachePromptInjection: bool(value.cachePromptInjection, DEFAULT_CONFIG.cachePromptInjection),
		showCostSavings: bool(value.showCostSavings, DEFAULT_CONFIG.showCostSavings),
		showCostBreakdown: bool(value.showCostBreakdown, DEFAULT_CONFIG.showCostBreakdown),
		showSavings: bool(value.showSavings, DEFAULT_CONFIG.showSavings),
		strictPrefixWarnings: bool(value.strictPrefixWarnings, DEFAULT_CONFIG.strictPrefixWarnings),
		parallelReadTool: bool(value.parallelReadTool, DEFAULT_CONFIG.parallelReadTool),
		contextWarnPct: pct(value.contextWarnPct, DEFAULT_CONFIG.contextWarnPct),
		contextDangerPct: pct(value.contextDangerPct, DEFAULT_CONFIG.contextDangerPct),
		contextCompactPct: pct(value.contextFoldPct ?? value.contextCompactPct, DEFAULT_CONFIG.contextCompactPct),
		contextForceFoldPct: pct(value.contextForceFoldPct, DEFAULT_CONFIG.contextForceFoldPct),
		foldHitRateThreshold: pct(value.foldHitRateThreshold, DEFAULT_CONFIG.foldHitRateThreshold),
		adviseCompactHitRateThreshold: pct(value.adviseCompactHitRateThreshold, DEFAULT_CONFIG.adviseCompactHitRateThreshold),
		showTurnEstimate: bool(value.showTurnEstimate, DEFAULT_CONFIG.showTurnEstimate),
		minTurnsBetweenCompacts: num(value.minTurnsBetweenCompacts, DEFAULT_CONFIG.minTurnsBetweenCompacts, 0),
		maxCompactsPerSession: num(value.maxCompactsPerSession, DEFAULT_CONFIG.maxCompactsPerSession, 1),
		statusLine: bool(value.statusLine, DEFAULT_CONFIG.statusLine),
		persistDiagnostics: bool(value.persistDiagnostics, DEFAULT_CONFIG.persistDiagnostics),
		enableAgenticTools: bool(value.enableAgenticTools, DEFAULT_CONFIG.enableAgenticTools),
		pruneEnabled: bool(value.pruneEnabled, DEFAULT_CONFIG.pruneEnabled),
		pruneOn: pruneMode(value.pruneOn, DEFAULT_CONFIG.pruneOn),
		pruneModel: str(value.pruneModel, DEFAULT_CONFIG.pruneModel),
		pruneIncludeContext: bool(value.pruneIncludeContext, DEFAULT_CONFIG.pruneIncludeContext),
		pruneBatchSize: intRange(value.pruneBatchSize, DEFAULT_CONFIG.pruneBatchSize, 1, 20),
		pruneBridgeLength: intRange(value.pruneBridgeLength, DEFAULT_CONFIG.pruneBridgeLength, 1, 8),
		statusBarStyle: (value.statusBarStyle === "blocks" || value.statusBarStyle === "sparkline" || value.statusBarStyle === "text") ? value.statusBarStyle : DEFAULT_CONFIG.statusBarStyle,
		foldThreshold: pct(value.foldThreshold, DEFAULT_CONFIG.foldThreshold),
		aggressiveFoldThreshold: pct(value.aggressiveFoldThreshold, DEFAULT_CONFIG.aggressiveFoldThreshold),
		exitSummaryThreshold: pct(value.exitSummaryThreshold, DEFAULT_CONFIG.exitSummaryThreshold),
		preflightFoldThreshold: pct(value.preflightFoldThreshold, DEFAULT_CONFIG.preflightFoldThreshold),
		aggressiveFoldTailPct: pct(value.aggressiveFoldTailPct, DEFAULT_CONFIG.aggressiveFoldTailPct),
		minFoldSavings: pct(value.minFoldSavings, DEFAULT_CONFIG.minFoldSavings),
		foldTimeoutMs: num(value.foldTimeoutMs, DEFAULT_CONFIG.foldTimeoutMs, 100),
		semanticFoldMarker: str(value.semanticFoldMarker, DEFAULT_CONFIG.semanticFoldMarker),
		checkpointStartsSegment: bool(value.checkpointStartsSegment, DEFAULT_CONFIG.checkpointStartsSegment),
		skillPinning: bool(value.skillPinning, DEFAULT_CONFIG.skillPinning),
		memoryInjection: bool(value.memoryInjection, DEFAULT_CONFIG.memoryInjection),
		priorityInjection: bool(value.priorityInjection, DEFAULT_CONFIG.priorityInjection),
		reasonixCompatibilityRoots: bool(value.reasonixCompatibilityRoots, DEFAULT_CONFIG.reasonixCompatibilityRoots),
		autoDetectSkillPins: bool(value.autoDetectSkillPins, DEFAULT_CONFIG.autoDetectSkillPins),
		autoPinFrequentSkills: bool(value.autoPinFrequentSkills, DEFAULT_CONFIG.autoPinFrequentSkills),
		skillPinConfirmThreshold: num(value.skillPinConfirmThreshold, DEFAULT_CONFIG.skillPinConfirmThreshold, 1),
	};
}

export function readConfig(path = getConfigPath()): ExtensionConfig {
	if (!existsSync(path)) {
		writeConfig(DEFAULT_CONFIG, path);
		return { ...DEFAULT_CONFIG };
	}
	try {
		return parseConfig(JSON.parse(readFileSync(path, "utf-8")));
	} catch (error) {
		console.warn(`[pi-context-engine] failed to read config: ${error instanceof Error ? error.message : String(error)}`);
		return { ...DEFAULT_CONFIG };
	}
}

export function writeConfig(config: ExtensionConfig, path = getConfigPath()): { ok: true } | { ok: false; error: string } {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		return { ok: true };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

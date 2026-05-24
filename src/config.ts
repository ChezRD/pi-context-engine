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
}

export const CONFIG_BASENAME = "deepseek-cache.json";

export const DEFAULT_CONFIG: ExtensionConfig = {
	enabled: true,
	diagnostics: true,
	mutateSystemPrompt: false,
	mutateProviderPayload: false,
	registerDynamicProvider: false,
	dynamicProviderName: "deepseek-cache-provider",
	deepseekBaseUrl: "https://api.deepseek.com",
	deepseekApiKeyEnv: "DEEPSEEK_API_KEY",
	allowOverrideBuiltInDeepSeek: false,
	hugeResultCapper: false,
	hugeResultChars: 65_536,
	hugeResultHeadChars: 6_000,
	hugeResultTailChars: 6_000,
	prefixStabilityCheck: true,
	prefixFingerprint: true,
	toolFingerprint: true,
	appendOnlyProjection: false,
	autoCompactAtHighWatermark: false,
	autoFold: false,
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

function num(value: unknown, fallback: number, min = 0): number {
	return typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;
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
		console.warn(`[pi-deepseek-cache] failed to read config: ${error instanceof Error ? error.message : String(error)}`);
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

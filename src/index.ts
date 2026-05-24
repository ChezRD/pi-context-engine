import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, getConfigPath, readConfig, writeConfig, type ExtensionConfig } from "./config.ts";
import { detectDeepSeekModel, isDeepSeekDetectionActive } from "./deepseek-detector.ts";
import { emptyStats, addUsage, extractUsageSnapshot, formatStats, formatStatus, markCompaction } from "./telemetry.ts";
import { inspectProviderPayload, formatPayloadDiagnostics } from "./payload-diagnostics.ts";
import { readContextPercent, recommendContextAction } from "./context-monitor.ts";
import { detectPruner, formatPrunerStatus } from "./pruner-advisor.ts";
import { HugeResultStore, maybeCapToolResult, registerLookupTool } from "./capper.ts";
import { maybeRegisterDynamicProvider } from "./dynamic-provider.ts";
import type { CacheStats, DeepSeekDetection, PayloadDiagnostics } from "./types.ts";

const STATUS_KEY = "deepseek-cache";
const COMMAND = "deepseek-cache";

interface RuntimeState {
	config: ExtensionConfig;
	stats: CacheStats;
	detection: DeepSeekDetection;
	lastPayload?: PayloadDiagnostics;
	contextPct?: number;
	dynamicModels: string[];
	lookupRegistered: boolean;
}

export default async function deepSeekCache(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	const store = new HugeResultStore();
	const state: RuntimeState = {
		config: readConfig(),
		stats: emptyStats(),
		detection: detectDeepSeekModel((ctx as any).model),
		dynamicModels: [],
		lookupRegistered: false,
	};

	if (state.config.registerDynamicProvider) state.dynamicModels = await maybeRegisterDynamicProvider(pi, state.config);
	if (state.config.hugeResultCapper) ensureLookupTool(pi, store, state);

	registerCommands(pi, ctx, state, store);

	pi.on("session_start", async () => {
		state.config = readConfig();
		state.detection = detectDeepSeekModel((ctx as any).model);
		if (state.config.hugeResultCapper) ensureLookupTool(pi, store, state);
		await refreshContextAndStatus(ctx, state);
	});

	pi.on("model_select", async () => {
		state.config = readConfig();
		state.detection = detectDeepSeekModel((ctx as any).model);
		await refreshContextAndStatus(ctx, state);
	});

	pi.on("before_provider_request", async (event: any) => {
		if (!state.config.enabled || !state.config.diagnostics) return undefined;
		state.lastPayload = inspectProviderPayload(event?.payload);
		if (state.config.persistDiagnostics) pi.appendEntry?.("deepseek-cache.payload", state.lastPayload);
		return undefined;
	});

	pi.on("tool_result", async (event: any) => {
		if (!state.config.enabled) return undefined;
		return maybeCapToolResult(event, state.config, store);
	});

	pi.on("message_end", async (event: any) => {
		if (!state.config.enabled) return undefined;
		const snapshot = extractUsageSnapshot(event?.message ?? event);
		if (snapshot) state.stats = addUsage(state.stats, snapshot);
		await refreshContextAndStatus(ctx, state);
		return undefined;
	});

	pi.on("agent_end", async (event: any) => {
		const snapshot = extractUsageSnapshot(event?.message ?? event?.assistantMessage ?? event);
		if (snapshot) state.stats = addUsage(state.stats, snapshot);
		await refreshContextAndStatus(ctx, state);
		return undefined;
	});

	pi.on("turn_end", async () => {
		await refreshContextAndStatus(ctx, state);
		return undefined;
	});

	pi.on("session_compact", async () => {
		state.stats = markCompaction(state.stats);
		await refreshContextAndStatus(ctx, state);
		return undefined;
	});

	await refreshContextAndStatus(ctx, state);
}

function ensureLookupTool(pi: any, store: HugeResultStore, state: RuntimeState): void {
	if (state.lookupRegistered) return;
	registerLookupTool(pi, store);
	state.lookupRegistered = true;
}

async function refreshContextAndStatus(ctx: any, state: RuntimeState): Promise<void> {
	state.contextPct = await readContextPercent(ctx);
	setStatus(ctx, state);
}

function setStatus(ctx: any, state: RuntimeState): void {
	if (!state.config.statusLine || !ctx?.ui?.setStatus) return;
	if (!state.config.enabled || !isDeepSeekDetectionActive(state.detection)) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const rec = recommendContextAction(state.contextPct, state.config);
	const suffix = rec.level === "warn" ? " ⚠" : rec.level === "danger" ? " ⛔" : "";
	ctx.ui.setStatus(STATUS_KEY, `${formatStatus(state.stats, state.contextPct)}${suffix}`);
}

function registerCommands(pi: any, ctx: any, state: RuntimeState, store: HugeResultStore): void {
	pi.registerCommand(COMMAND, {
		description: "DeepSeek cache diagnostics and long-session recommendations",
		handler: async (args: string) => {
			const [sub = "status"] = String(args ?? "").trim().split(/\s+/).filter(Boolean);
			state.config = readConfig();
			state.detection = detectDeepSeekModel(ctx?.model);
			state.contextPct = await readContextPercent(ctx);
			switch (sub) {
				case "status":
					return buildStatus(pi, state);
				case "diagnose":
					return buildDiagnose(pi, state);
				case "recommend-pruner":
				case "pruner":
					return formatPrunerStatus(detectPruner(pi));
				case "reset-stats":
					state.stats = emptyStats();
					setStatus(ctx, state);
					return "DeepSeek cache stats reset.";
				case "enable-capper": {
					const next = { ...state.config, hugeResultCapper: true };
					const result = writeConfig(next);
					if (result.ok) {
						state.config = next;
						ensureLookupTool(pi, store, state);
						return `Huge-result capper enabled. Warning: enabling lookup tool mid-session can cause one DeepSeek cache-miss turn. Config: ${getConfigPath()}`;
					}
					return `Failed: ${result.error}`;
				}
				case "disable-capper": {
					const next = { ...state.config, hugeResultCapper: false };
					const result = writeConfig(next);
					if (result.ok) {
						state.config = next;
						return `Huge-result capper disabled. Lookup tool remains registered until session reload. Config: ${getConfigPath()}`;
					}
					return `Failed: ${result.error}`;
				}
				case "init": {
					const result = writeConfig(DEFAULT_CONFIG);
					return result.ok ? `Wrote ${getConfigPath()}` : `Failed: ${result.error}`;
				}
				default:
					return usage();
			}
		},
	});
}

function buildStatus(pi: any, state: RuntimeState): string {
	const context = recommendContextAction(state.contextPct, state.config);
	return [
		`config: ${getConfigPath()}`,
		`enabled: ${state.config.enabled ? "yes" : "no"}`,
		`model_kind: ${state.detection.kind}`,
		`model_ok: ${state.detection.ok ? "yes" : "no"}`,
		`model: ${state.detection.provider ?? "unknown"}/${state.detection.modelId ?? "unknown"}`,
		state.detection.warnings.length ? `warnings:\n${state.detection.warnings.map((w) => `  - ${w}`).join("\n")}` : "warnings: none",
		formatStats(state.stats),
		`context_percent: ${state.contextPct === undefined ? "n/a" : `${Math.round(state.contextPct * 100)}%`}`,
		`context_recommendation: ${context.message}`,
		`dynamic_provider_models: ${state.dynamicModels.length ? state.dynamicModels.join(", ") : "disabled"}`,
		`huge_result_capper: ${state.config.hugeResultCapper ? "on" : "off"}`,
		`pruner_detected: ${detectPruner(pi).installed ? "yes" : "no"}`,
	].join("\n");
}

function buildDiagnose(pi: any, state: RuntimeState): string {
	return [buildStatus(pi, state), "", formatPayloadDiagnostics(state.lastPayload), "", formatPrunerStatus(detectPruner(pi))].join("\n");
}

function usage(): string {
	return [
		"Usage: /deepseek-cache <command>",
		"commands:",
		"  status",
		"  diagnose",
		"  recommend-pruner",
		"  reset-stats",
		"  enable-capper",
		"  disable-capper",
		"  init",
	].join("\n");
}

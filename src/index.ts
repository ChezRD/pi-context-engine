import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readConfig } from "./config.ts";
import { detectDeepSeekModel } from "./model.ts";
import { addUsage, extractUsageSnapshot, markCompaction } from "./stats.ts";
import { inspectProviderPayload } from "./payload-diagnostics.ts";
import { readContextPercent } from "./context-monitor.ts";
import { HugeResultStore, maybeCapToolResult } from "./capper.ts";
import { maybeRegisterDynamicProvider } from "./dynamic-provider.ts";
import { createRuntimeState, type RuntimeState } from "./runtime-state.ts";
import { ensureLookupTool, getDeepSeekCacheCompletions, registerCommands } from "./commands.ts";
import { registerAgenticTools } from "./agentic/tools.ts";
import { registerPruneTool, syncPruneToolActivation } from "./projection/prune-tool.ts";
import { registerDashboardCommand } from "./ui/dashboard.ts";
import { registerTimelineTool } from "./ui/timeline.ts";
import { registerCompactToolRenderers } from "./ui/tool-renderers.ts";
import { setStatus } from "./status.ts";
import { persistTelemetry, restoreTelemetryFromSession } from "./telemetry-persistence.ts";
import { PinStore, persistPinEntry, restorePinsFromSession } from "./context-pins/store.ts";
import { registerPinTools } from "./context-pins/tools.ts";
import { applyPinInjection, computeInjectionHash } from "./context-pins/injection.ts";
import { detectTextualToolCall, handleBeforeAgentStart, handleBeforeProviderRequest, handleContext, handleMessageEnd, handleSessionBeforeCompact, handleToolCall, handleTurnEnd, registerFoldTool, registerParallelReadTool } from "./cache-engine/index.ts";
import { annotateUsageForCurrentSegment, openCacheCheckpoint } from "./cache-engine/cache-checkpoints.ts";
import { recordPostPruneImpact } from "./projection/prune-impact.ts";
import { buildSessionContentMap } from "./projection/session-map.ts";
import { t } from "./i18n/index.ts";

export { getDeepSeekCacheCompletions } from "./commands.ts";

const CUSTOM_TYPE_HUGE_RESULT = "context-engine-huge-result";
type PersistentHugeResultStore = HugeResultStore & {
	setPersist: (persist: (record: any) => void) => void;
	restore: (record: any) => void;
};

export default async function deepSeekCache(pi: ExtensionAPI, initialCtx?: ExtensionContext): Promise<void> {
	const store = new HugeResultStore() as PersistentHugeResultStore;
	store.setPersist((record) => persistHugeResultEntry(pi, record));
	let currentCtx: any = initialCtx;
	const withCtx = (ctx?: any): any => {
		if (ctx) currentCtx = ctx;
		return currentCtx;
	};
	const state = createRuntimeState(currentCtx);
	state.pinStore.setPersist((record) => persistPinEntry(pi, record));

	if (state.config.registerDynamicProvider) state.dynamicModels = await maybeRegisterDynamicProvider(pi, state.config);
	if (state.config.hugeResultCapper) {
		ensureLookupTool(pi, store, state);
		registerCompactToolRenderers(pi, store);
	}
	registerFoldTool(pi, state);
	registerParallelReadTool(pi, state);

	registerCommands(pi, () => currentCtx, state, store, state.toolIndexer);
	registerAgenticTools(pi, {
		cacheState: state,
		onRewind: () => {
			state.engine.prune.pendingBatches = [];
			state.engine.prune.pendingSummaries = [];
			state.engine.prune.batchStepCounter = 0;
			state.engine.prune.appliedIds = [];
			state.engine.prune.pruneRunCount = 0;
			delete state.engine.prune.awaitingImpact;
			state.toolIndexer.reset();
		},
	});
	registerPruneTool(pi, state.toolIndexer, state);
	registerDashboardCommand({ pi, getState: () => state });
	registerTimelineTool({ pi, getState: () => state });
	registerPinTools(pi, state);
	registerLifecycleHandlers(pi, withCtx, state, store);

	restoreHugeResultsFromSession(currentCtx, store);
	restorePinsFromSession(currentCtx, state.pinStore);
	await refreshContextAndStatus(currentCtx, state);
}

function persistHugeResultEntry(pi: ExtensionAPI, record: any): void {
	if (typeof (pi as any)?.appendEntry !== "function") return;
	(pi as any).appendEntry(CUSTOM_TYPE_HUGE_RESULT, { version: 1, record });
}

function restoreHugeResultsFromSession(ctx: any, store: PersistentHugeResultStore): number {
	const entries = ctx?.sessionManager?.getEntries?.() ?? ctx?.sessionManager?.getBranch?.() ?? [];
	let count = 0;
	for (const entry of entries) {
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE_HUGE_RESULT && entry?.data?.version === 1 && entry?.data?.record) {
			store.restore(entry.data.record);
			count += 1;
		}
	}
	return count;
}

function registerLifecycleHandlers(pi: ExtensionAPI, withCtx: (ctx?: any) => any, state: RuntimeState, store: PersistentHugeResultStore): void {
	pi.on("session_start", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		state.detection = detectDeepSeekModel(liveCtx?.model);
		restoreHugeResultsFromSession(liveCtx, store);
		restorePinsFromSession(liveCtx, state.pinStore);
		if (state.config.hugeResultCapper) {
			ensureLookupTool(pi, store, state);
			registerCompactToolRenderers(pi, store);
		}
		registerFoldTool(pi, state);
		registerParallelReadTool(pi, state);
		registerPinTools(pi, state);
		syncPruneToolActivation(pi, state.config);
		await refreshContextAndStatus(liveCtx, state);
	});

	pi.on("model_select", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		const previousDetection = state.detection;
		state.detection = detectDeepSeekModel(liveCtx?.model);
		openCacheCheckpoint(state, "model_select", { modelId: state.detection.modelId, provider: state.detection.provider, previousModelId: previousDetection.modelId, startSegment: true });
		persistTelemetry(pi, state);
		await refreshContextAndStatus(liveCtx, state);
	});

	pi.on("before_agent_start", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		const baseResult = await handleBeforeAgentStart(pi, event, liveCtx, state);

		// Track pin injection hash for checkpoint drift
		const currentHash = computeInjectionHash(state.config, state);
		if (state.engine.lastPinInjectionHash && state.engine.lastPinInjectionHash !== currentHash) {
			openCacheCheckpoint(state, "pin_drift", { note: "pin/memory injection changed", startSegment: false });
		}
		state.engine.lastPinInjectionHash = currentHash;

		const pinResult = applyPinInjection(event, state);
		const basePrompt = baseResult?.systemPrompt?.trim();
		const pinPrompt = pinResult?.systemPrompt?.trim();

		if (!pinPrompt) return baseResult ?? undefined;
		if (!basePrompt) return { systemPrompt: pinPrompt };
		return { systemPrompt: basePrompt + "\n\n" + pinPrompt };
	});

	pi.on("context", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		return handleContext(event, liveCtx, state);
	});

	pi.on("session_before_compact", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		return handleSessionBeforeCompact(event, liveCtx, state);
	});

	pi.on("before_provider_request", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		if (!state.config.enabled) return undefined;
		handleBeforeProviderRequest(event, liveCtx, state);
		state.engine.pendingUsageModelId = state.engine.lastProviderModelId ?? state.detection.modelId;
		state.engine.pendingUsageProvider = liveCtx?.model?.provider ?? state.detection.provider;
		if (!state.config.diagnostics) return undefined;
		state.lastPayload = inspectProviderPayload(event?.payload ?? event?.body ?? event);
		if (state.config.persistDiagnostics) pi.appendEntry?.("context-engine.payload", state.lastPayload);
		return undefined;
	});

	pi.on("tool_call", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		return handleToolCall(event, liveCtx, state);
	});

	pi.on("tool_result", async (event: any) => {
		if (!state.config.enabled) return undefined;
		return maybeCapToolResult(event, state.config, store);
	});

	pi.on("message_end", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		if (!state.config.enabled) return undefined;
		syncModelSelection(liveCtx, state);
		const message = event?.message ?? event;
		if (message?.role && message.role !== "assistant") return undefined;
		if (detectTextualToolCall(message)) liveCtx?.ui?.notify?.(t(state.config, "engine.tool.textualMissing"), "warning");
		const snapshot = extractUsageSnapshot(message);
		if (snapshot) snapshot.turn = state.engine.turnIndex;
		if (snapshot) attachPendingProviderModel(state, snapshot);
		const annotated = snapshot ? annotateUsageForCurrentSegment(state, snapshot) : undefined;
		if (annotated) state.stats = addUsage(state.stats, annotated, annotated.modelId ?? state.detection.modelId, liveCtx?.model?.cost);
		if (annotated) recordPostPruneImpact(state, annotated, liveCtx?.model?.cost);
		if (annotated) persistTelemetry(pi, state);
		await handleMessageEnd(event, pi, liveCtx, state);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("agent_end", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		syncModelSelection(liveCtx, state);
		const snapshot = extractUsageSnapshot(event?.message ?? event?.assistantMessage ?? event);
		if (snapshot) snapshot.turn = state.engine.turnIndex;
		if (snapshot) attachPendingProviderModel(state, snapshot);
		const annotated = snapshot ? annotateUsageForCurrentSegment(state, snapshot) : undefined;
		if (annotated && state.stats.requests === 0) state.stats = addUsage(state.stats, annotated, annotated.modelId ?? state.detection.modelId, liveCtx?.model?.cost);
		if (annotated) recordPostPruneImpact(state, annotated, liveCtx?.model?.cost);
		if (annotated) persistTelemetry(pi, state);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("turn_end", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		await handleTurnEnd(_event, pi, liveCtx, state);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("session_compact", async (_event: any, ctx: any) => {
		openCacheCheckpoint(state, "compact", { startSegment: true });
		state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "host", completed: true });
		persistTelemetry(pi, state);
		await refreshContextAndStatus(withCtx(ctx), state);
		return undefined;
	});
}

async function refreshContextAndStatus(ctx: any, state: RuntimeState): Promise<void> {
	syncModelSelection(ctx, state);
	let branch: any[] | undefined;

	if (state.stats.requests === 0) {
		if (restoreTelemetryFromSession(ctx, state)) {
			branch = await ctx?.sessionManager?.getBranch?.();
			state.engine.prune.sessionMap = buildSessionContentMap(branch, state);
			state.contextPct = await readContextPercent(ctx);
			setStatus(ctx, state);
			return;
		}
		try {
			branch = await ctx?.sessionManager?.getBranch?.();
			if (branch && branch.length > 0) {
				for (const entry of branch) {
					if (entry.message?.role === "assistant") {
						const snap = extractUsageSnapshot(entry.message);
						if (snap) {
							snap.turn = entry.turnIndex ?? 0;
							const annotated = annotateUsageForCurrentSegment(state, snap);
							state.stats = addUsage(state.stats, annotated, annotated.modelId ?? state.detection.modelId, ctx?.model?.cost);
						}
					}
				}
			}
		} catch (e) {
			// ignore
		}
	}
	if (!branch) {
		try {
			branch = await ctx?.sessionManager?.getBranch?.();
		} catch {
			branch = undefined;
		}
	}
	state.engine.prune.sessionMap = buildSessionContentMap(branch, state);
	state.contextPct = await readContextPercent(ctx);
	setStatus(ctx, state);
}

export function syncModelSelection(ctx: any, state: RuntimeState): void {
	const nextDetection = detectDeepSeekModel(ctx?.model);
	if (
		state.stats.requests > 0
		&& nextDetection.modelId
		&& (nextDetection.modelId !== state.detection.modelId || nextDetection.provider !== state.detection.provider)
	) {
		const previousDetection = state.detection;
		state.detection = nextDetection;
		openCacheCheckpoint(state, "model_select", { modelId: nextDetection.modelId, provider: nextDetection.provider, previousModelId: previousDetection.modelId, startSegment: true });
	} else {
		state.detection = nextDetection;
	}
}

function attachPendingProviderModel(state: RuntimeState, snapshot: any): void {
	if (state.engine.pendingUsageModelId && !snapshot.modelId) snapshot.modelId = state.engine.pendingUsageModelId;
	if (state.engine.pendingUsageProvider && !snapshot.provider) snapshot.provider = state.engine.pendingUsageProvider;
	delete state.engine.pendingUsageModelId;
	delete state.engine.pendingUsageProvider;
}

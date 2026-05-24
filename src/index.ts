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
import { setStatus } from "./status.ts";
import { detectTextualToolCall, handleBeforeAgentStart, handleBeforeProviderRequest, handleContext, handleSessionBeforeCompact, handleToolCall, handleTurnEnd, registerFoldTool, registerParallelReadTool } from "./cache-engine/index.ts";
import { t } from "./i18n/index.ts";

export { getDeepSeekCacheCompletions } from "./commands.ts";

export default async function deepSeekCache(pi: ExtensionAPI, initialCtx?: ExtensionContext): Promise<void> {
	const store = new HugeResultStore();
	let currentCtx: any = initialCtx;
	const withCtx = (ctx?: any): any => {
		if (ctx) currentCtx = ctx;
		return currentCtx;
	};
	const state = createRuntimeState(currentCtx);

	if (state.config.registerDynamicProvider) state.dynamicModels = await maybeRegisterDynamicProvider(pi, state.config);
	if (state.config.hugeResultCapper) ensureLookupTool(pi, store, state);
	registerFoldTool(pi, state);
	registerParallelReadTool(pi, state);

	registerCommands(pi, () => currentCtx, state, store);
	registerLifecycleHandlers(pi, withCtx, state, store);

	await refreshContextAndStatus(currentCtx, state);
}

function registerLifecycleHandlers(pi: ExtensionAPI, withCtx: (ctx?: any) => any, state: RuntimeState, store: HugeResultStore): void {
	pi.on("session_start", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		state.detection = detectDeepSeekModel(liveCtx?.model);
		if (state.config.hugeResultCapper) ensureLookupTool(pi, store, state);
		registerFoldTool(pi, state);
		registerParallelReadTool(pi, state);
		await refreshContextAndStatus(liveCtx, state);
	});

	pi.on("model_select", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		state.detection = detectDeepSeekModel(liveCtx?.model);
		await refreshContextAndStatus(liveCtx, state);
	});

	pi.on("before_agent_start", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		return handleBeforeAgentStart(event, liveCtx, state);
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
		if (!state.config.diagnostics) return undefined;
		state.lastPayload = inspectProviderPayload(event?.payload ?? event?.body ?? event);
		if (state.config.persistDiagnostics) pi.appendEntry?.("deepseek-cache.payload", state.lastPayload);
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
		const message = event?.message ?? event;
		if (message?.role && message.role !== "assistant") return undefined;
		if (detectTextualToolCall(message)) liveCtx?.ui?.notify?.(t(state.config, "engine.tool.textualMissing"), "warning");
		const snapshot = extractUsageSnapshot(message);
		if (snapshot) snapshot.turn = state.engine.turnIndex;
		if (snapshot) state.stats = addUsage(state.stats, snapshot, state.detection.modelId, liveCtx?.model?.cost);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("agent_end", async (event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		const snapshot = extractUsageSnapshot(event?.message ?? event?.assistantMessage ?? event);
		if (snapshot) snapshot.turn = state.engine.turnIndex;
		if (snapshot && state.stats.requests === 0) state.stats = addUsage(state.stats, snapshot, state.detection.modelId, liveCtx?.model?.cost);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("turn_end", async (_event: any, ctx: any) => {
		const liveCtx = withCtx(ctx);
		state.config = readConfig();
		handleTurnEnd(_event, pi, liveCtx, state);
		await refreshContextAndStatus(liveCtx, state);
		return undefined;
	});

	pi.on("session_compact", async (_event: any, ctx: any) => {
		state.stats = markCompaction(state.stats, { turn: state.engine.turnIndex, reason: "host", completed: true });
		await refreshContextAndStatus(withCtx(ctx), state);
		return undefined;
	});
}

async function refreshContextAndStatus(ctx: any, state: RuntimeState): Promise<void> {
	state.detection = detectDeepSeekModel(ctx?.model);
	state.contextPct = await readContextPercent(ctx);
	setStatus(ctx, state);
}

import { DEFAULT_CONFIG, getConfigPath, readConfig, writeConfig } from "./config.ts";
import { detectDeepSeekModel } from "./model.ts";
import { readContextPercent } from "./context-monitor.ts";
import { emptyStats } from "./stats.ts";

import { formatPayloadDiagnostics } from "./payload-diagnostics.ts";
import type { HugeResultStore } from "./capper.ts";
import { registerLookupTool } from "./capper.ts";
import { buildDetailedStatus, buildStatus, formatPruneSummarizerTrace, setStatus } from "./status.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { holdCompaction, requestCompact, requestFold } from "./cache-engine/index.ts";
import { openCacheCheckpoint } from "./cache-engine/cache-checkpoints.ts";
import { openSettingsMenu } from "./ui/settings.ts";
import { t } from "./i18n/index.ts";
import { executePrune, syncPruneToolActivation } from "./projection/prune-tool.ts";
import type { ToolCallIndexerInstance } from "./projection/indexer.ts";
import { rebuildPrunedContextFromSession } from "./projection/rebuild.ts";

export const COMMAND = "context-engine";
export const PRUNE_COMMAND = "prune";

const SUBCOMMANDS = [
	{ value: "status", label: "status", descriptionKey: "cmd.status.description" },
	{ value: "diagnose", label: "diagnose", descriptionKey: "cmd.diagnose.description" },
	{ value: "fold", label: "fold", descriptionKey: "cmd.fold.description" },
	{ value: "compact", label: "compact", descriptionKey: "cmd.compact.description" },
	{ value: "hold", label: "hold", descriptionKey: "cmd.hold.description" },
	{ value: "prune", label: "prune", descriptionKey: "tool.prune.description" },
	{ value: "config", label: "config", descriptionKey: "cmd.config.description" },
	{ value: "reset-stats", label: "reset-stats", descriptionKey: "cmd.resetStats.description" },
	{ value: "enable-capper", label: "enable-capper", descriptionKey: "cmd.enableCapper.description" },
	{ value: "disable-capper", label: "disable-capper", descriptionKey: "cmd.disableCapper.description" },
	{ value: "init", label: "init", descriptionKey: "cmd.init.description" },
] as const;

const ARGUMENT_HINT = "status | diagnose | fold | compact | hold | prune | config | reset-stats | enable-capper | disable-capper | init";

type NotifyLevel = "info" | "warning" | "error";
interface CommandResult { text: string; level: NotifyLevel; }

export function getCacheCompletions(prefix: string): Array<{ value: string; label: string; description: string }> | null {
	const trimmed = prefix.trimStart();
	if (trimmed.includes(" ")) return null;
	const filtered = SUBCOMMANDS.filter((item) => item.value.startsWith(trimmed));
	return filtered.length > 0 ? filtered.map((item) => ({ value: item.value, label: item.label, description: t(undefined, item.descriptionKey) })) : null;
}

export function registerCommands(pi: any, getCtx: () => any, state: RuntimeState, store: HugeResultStore, indexer: ToolCallIndexerInstance): void {
	const definition = {
		description: t(undefined, "cmd.description"),
		argumentHint: ARGUMENT_HINT,
		getArgumentCompletions: getCacheCompletions,
		handler: async (args: string, commandCtx?: any) => executeSubcommand(pi, getCtx, state, store, indexer, args, commandCtx),
	};
	pi.registerCommand(COMMAND, definition);
	pi.registerCommand(PRUNE_COMMAND, {
		description: t(undefined, "tool.prune.description"),
		handler: async (_args: string, commandCtx?: any) => {
			const ctx = commandCtx ?? getCtx();
			state.config = readConfig();
			state.detection = detectDeepSeekModel(ctx?.model);
			state.contextPct = await readContextPercent(ctx);
			const result = await pruneNow(pi, ctx, state, indexer);
			notifyCommand(ctx, result.text, result.level);
			return result.text;
		},
	});
}

function splitArgs(args: string | undefined): string[] {
	return String(args ?? "").trim().split(/\s+/).filter(Boolean);
}

async function executeSubcommand(pi: any, getCtx: () => any, state: RuntimeState, store: HugeResultStore, indexer: ToolCallIndexerInstance, args: string | undefined, commandCtx?: any): Promise<string> {
	const ctx = commandCtx ?? getCtx();
	const parts = splitArgs(args);
	state.config = readConfig();
	state.detection = detectDeepSeekModel(ctx?.model);
	state.contextPct = await readContextPercent(ctx);
	const result = await runSubcommand(pi, ctx, state, store, indexer, parts[0] ?? "status", parts.slice(1));
	notifyCommand(ctx, result.text, result.level);
	return result.text;
}

async function runSubcommand(pi: any, ctx: any, state: RuntimeState, store: HugeResultStore, indexer: ToolCallIndexerInstance, sub: string, args: string[]): Promise<CommandResult> {
	switch (sub) {
		case "status": return { text: buildStatus(pi, state), level: "info" };
		case "diagnose": return { text: buildDiagnose(pi, state), level: "info" };
		case "fold": return await foldNow(pi, ctx, state);
		case "compact": return compactNow(ctx, state);
		case "hold": return holdNow(state);
		case "prune": return await pruneNow(pi, ctx, state, indexer);
		case "config": return await configNow(pi, ctx, state);
		case "reset-stats":
			openCacheCheckpoint(state, "manual_reset", { startSegment: true });
			state.stats = emptyStats();
			setStatus(ctx, state);
			return { text: t(state.config, "cmd.resetStats.done"), level: "info" };
		case "enable-capper": return enableCapper(pi, store, state);
		case "disable-capper": return disableCapper(state);
		case "init": return initConfig();
		default: return { text: usage(), level: "warning" };
	}
}

async function configNow(pi: any, ctx: any, state: RuntimeState): Promise<CommandResult> {
	const newConfig = await openSettingsMenu(pi, ctx, state.config);
	if (!newConfig) {
		return { text: t(state.config, "cmd.config.cancelled") ?? "Config edit cancelled.", level: "info" };
	}
	
	// Merge and save
	Object.assign(state.config, newConfig);
	writeConfig(state.config);
	syncPruneToolActivation(pi, state.config);
	setStatus(ctx, state);
	
	return { text: t(state.config, "cmd.config.saved") ?? "Configuration saved successfully.", level: "info" };
}

function buildDiagnose(pi: any, state: RuntimeState): string {
	return [
		buildDetailedStatus(pi, state),
		formatPayloadDiagnostics(state.lastPayload, state.config),
		formatPruneSummarizerTrace(state),
	].filter((section) => section.trim().length > 0).join("\n\n");
}

export function ensureLookupTool(pi: any, store: HugeResultStore, state: RuntimeState): void {
	if (state.lookupRegistered) return;
	registerLookupTool(pi, store);
	state.lookupRegistered = true;
}

async function foldNow(pi: any, ctx: any, state: RuntimeState): Promise<CommandResult> {
	const result = await requestFold(pi, ctx, state);
	return result.ok ? { text: t(state.config, "cmd.fold.done"), level: "info" } : { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
}

async function pruneNow(pi: any, ctx: any, state: RuntimeState, indexer: ToolCallIndexerInstance): Promise<CommandResult> {
	notifyCommand(ctx, t(state.config, "tool.prune.started"), "info");
	const result = await executePrune(pi, ctx, indexer, state, "auto");
	if ((result.details?.summarized ?? 0) > 0) {
		await rebuildPrunedContextFromSession(ctx, state, `${result.details.summarized} tool results pruned by /prune`, "engine.prune.rebuild.reason.manual");
	}
	setStatus(ctx, state);
	return { text: formatPruneCommandText(state, result), level: pruneResultLevel(result.details) };
}

export function formatPruneCommandText(state: RuntimeState, result: { text: string; details?: Record<string, any> }): string {
	const details = result.details;
	if (!details || (details.summarized ?? 0) > 0) return result.text;
	if (details.reason === "none_found") {
		const scan = details.scan ?? {};
		return [
			result.text,
			t(state.config, "tool.prune.noneFoundDetails", {
				seen: scan.seen ?? 0,
				summarized: scan.summarized ?? 0,
				applied: scan.applied ?? 0,
				skipped: (scan.skippedOversized ?? 0) + (scan.skippedMissingResult ?? 0),
				unhandled: scan.unhandled ?? 0,
			}),
		].join("\n");
	}
	const reason = details.errorKey ? t(state.config, details.errorKey) : (details.reason ?? t(state.config, "status.unknown"));
	return [
		result.text,
		t(state.config, "tool.prune.diagnostics", {
			reason,
			attempted: details.attempted ?? 0,
			batches: details.batches ?? 0,
			requests: details.summaryRequests ?? 0,
			model: details.modelId ?? state.config.pruneModel,
		}),
		t(state.config, "tool.prune.io", {
			raw: details.rawChars ?? 0,
			summary: details.summaryChars ?? 0,
			prompt: details.promptChars ?? 0,
			response: details.responseChars ?? 0,
			accepted: details.acceptedSummaries ?? 0,
		}),
		t(state.config, "tool.prune.trace"),
	].join("\n");
}

export function pruneResultLevel(details: Record<string, any> | undefined): NotifyLevel {
	if (!details) return "warning";
	if ((details.summarized ?? 0) > 0) return "info";
	if (details.reason === "none_found") return "warning";
	return "warning";
}

function compactNow(ctx: any, state: RuntimeState): CommandResult {
	const result = requestCompact(ctx, state);
	return result.ok ? { text: t(state.config, "cmd.compact.done"), level: "info" } : { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
}

function holdNow(state: RuntimeState): CommandResult {
	holdCompaction(state);
	return { text: t(state.config, "cmd.hold.done", { turns: state.config.minTurnsBetweenCompacts }), level: "info" };
}

function enableCapper(pi: any, store: HugeResultStore, state: RuntimeState): CommandResult {
	const next = { ...state.config, hugeResultCapper: true };
	const result = writeConfig(next);
	if (!result.ok) return { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
	state.config = next;
	return { text: t(state.config, "cmd.capper.enabled", { path: getConfigPath() }), level: "warning" };
}

function disableCapper(state: RuntimeState): CommandResult {
	const next = { ...state.config, hugeResultCapper: false };
	const result = writeConfig(next);
	if (!result.ok) return { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
	state.config = next;
	return { text: t(state.config, "cmd.capper.disabled", { path: getConfigPath() }), level: "info" };
}

function initConfig(): CommandResult {
	const result = writeConfig(DEFAULT_CONFIG);
	return result.ok ? { text: t(DEFAULT_CONFIG, "cmd.init.done", { path: getConfigPath() }), level: "info" } : { text: t(DEFAULT_CONFIG, "cmd.failed", { error: result.error }), level: "error" };
}

function notifyCommand(ctx: any, text: string, level: NotifyLevel = "info"): void {
	ctx?.ui?.notify?.(text, level);
}

function usage(): string {
	return [t(undefined, "cmd.usage.header"), t(undefined, "cmd.usage.commands"), ...SUBCOMMANDS.map((command) => `  ${command.value}`)].join("\n");
}

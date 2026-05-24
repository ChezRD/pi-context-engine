import { DEFAULT_CONFIG, getConfigPath, readConfig, writeConfig } from "./config.ts";
import { detectDeepSeekModel } from "./model.ts";
import { readContextPercent } from "./context-monitor.ts";
import { emptyStats } from "./stats.ts";

import { formatPayloadDiagnostics } from "./payload-diagnostics.ts";
import type { HugeResultStore } from "./capper.ts";
import { registerLookupTool } from "./capper.ts";
import { buildDetailedStatus, buildStatus, setStatus } from "./status.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { holdCompaction, requestCompact, requestFold } from "./cache-engine/index.ts";
import { t } from "./i18n/index.ts";

export const COMMAND = "deepseek-cache";

const SUBCOMMANDS = [
	{ value: "status", label: "status", descriptionKey: "cmd.status.description" },
	{ value: "diagnose", label: "diagnose", descriptionKey: "cmd.diagnose.description" },
	{ value: "fold", label: "fold", descriptionKey: "cmd.fold.description" },
	{ value: "compact", label: "compact", descriptionKey: "cmd.compact.description" },
	{ value: "hold", label: "hold", descriptionKey: "cmd.hold.description" },
	{ value: "config", label: "config", descriptionKey: "cmd.config.description" },
	{ value: "reset-stats", label: "reset-stats", descriptionKey: "cmd.resetStats.description" },
	{ value: "enable-capper", label: "enable-capper", descriptionKey: "cmd.enableCapper.description" },
	{ value: "disable-capper", label: "disable-capper", descriptionKey: "cmd.disableCapper.description" },
	{ value: "init", label: "init", descriptionKey: "cmd.init.description" },
] as const;

const ARGUMENT_HINT = "status | diagnose | fold | compact | hold | config | reset-stats | enable-capper | disable-capper | init";

type NotifyLevel = "info" | "warning" | "error";
interface CommandResult { text: string; level: NotifyLevel; }

export function getDeepSeekCacheCompletions(prefix: string): Array<{ value: string; label: string; description: string }> | null {
	const trimmed = prefix.trimStart();
	if (trimmed.includes(" ")) return null;
	const filtered = SUBCOMMANDS.filter((item) => item.value.startsWith(trimmed));
	return filtered.length > 0 ? filtered.map((item) => ({ value: item.value, label: item.label, description: t(undefined, item.descriptionKey) })) : null;
}

export function registerCommands(pi: any, getCtx: () => any, state: RuntimeState, store: HugeResultStore): void {
	const definition = {
		description: t(undefined, "cmd.description"),
		argumentHint: ARGUMENT_HINT,
		getArgumentCompletions: getDeepSeekCacheCompletions,
		handler: async (args: string, commandCtx?: any) => executeSubcommand(pi, getCtx, state, store, args, commandCtx),
	};
	pi.registerCommand(COMMAND, definition);
}

function splitArgs(args: string | undefined): string[] {
	return String(args ?? "").trim().split(/\s+/).filter(Boolean);
}

async function executeSubcommand(pi: any, getCtx: () => any, state: RuntimeState, store: HugeResultStore, args: string | undefined, commandCtx?: any): Promise<string> {
	const ctx = commandCtx ?? getCtx();
	const parts = splitArgs(args);
	state.config = readConfig();
	state.detection = detectDeepSeekModel(ctx?.model);
	state.contextPct = await readContextPercent(ctx);
	const result = runSubcommand(pi, ctx, state, store, parts[0] ?? "status", parts.slice(1));
	notifyCommand(ctx, result.text, result.level);
	return result.text;
}

function runSubcommand(pi: any, ctx: any, state: RuntimeState, store: HugeResultStore, sub: string, args: string[]): CommandResult {
	switch (sub) {
		case "status": return { text: buildStatus(pi, state), level: "info" };
		case "diagnose": return { text: buildDiagnose(pi, state), level: "info" };
		case "fold": return foldNow(ctx, state);
		case "compact": return compactNow(ctx, state);
		case "hold": return holdNow(state);
		case "config": return { text: buildConfig(pi, state), level: "info" };
		case "reset-stats":
			state.stats = emptyStats();
			setStatus(ctx, state);
			return { text: t(state.config, "cmd.resetStats.done"), level: "info" };
		case "enable-capper": return enableCapper(pi, store, state);
		case "disable-capper": return disableCapper(state);
		case "init": return initConfig();
		default: return { text: usage(), level: "warning" };
	}
}

function buildDiagnose(pi: any, state: RuntimeState): string {
	return [buildDetailedStatus(pi, state), "", formatPayloadDiagnostics(state.lastPayload, state.config)].join("\n");
}

export function ensureLookupTool(pi: any, store: HugeResultStore, state: RuntimeState): void {
	if (state.lookupRegistered) return;
	registerLookupTool(pi, store);
	state.lookupRegistered = true;
}

function foldNow(ctx: any, state: RuntimeState): CommandResult {
	const result = requestFold(ctx, state);
	return result.ok ? { text: t(state.config, "cmd.fold.done"), level: "info" } : { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
}

function compactNow(ctx: any, state: RuntimeState): CommandResult {
	const result = requestCompact(ctx, state);
	return result.ok ? { text: t(state.config, "cmd.compact.done"), level: "info" } : { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
}

function holdNow(state: RuntimeState): CommandResult {
	holdCompaction(state);
	return { text: t(state.config, "cmd.hold.done", { turns: state.config.minTurnsBetweenCompacts }), level: "info" };
}

function buildConfig(pi: any, state: RuntimeState): string {
	return [t(state.config, "cmd.config.title"), t(state.config, "cmd.config.file", { path: getConfigPath() }), JSON.stringify(state.config, null, 2)].join("\n");
}

function enableCapper(pi: any, store: HugeResultStore, state: RuntimeState): CommandResult {
	const next = { ...state.config, hugeResultCapper: true };
	const result = writeConfig(next);
	if (!result.ok) return { text: t(state.config, "cmd.failed", { error: result.error }), level: "error" };
	state.config = next;
	ensureLookupTool(pi, store, state);
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

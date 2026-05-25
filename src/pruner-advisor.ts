import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PrunerStatus } from "./types.ts";
import { t } from "./i18n/index.ts";

function namesFrom(items: any[]): string[] {
	return items.map((item) => (typeof item === "string" ? item : item?.name)).filter((name): name is string => typeof name === "string");
}

function readPrunerConfig(): Partial<PrunerStatus> {
	try {
		const path = join(homedir(), ".pi", "agent", "context-prune", "settings.json");
		if (!existsSync(path)) return {};
		const config = JSON.parse(readFileSync(path, "utf8"));
		return {
			enabled: typeof config.enabled === "boolean" ? config.enabled : undefined,
			pruneOn: typeof config.pruneOn === "string" ? config.pruneOn : undefined,
			batchingMode: typeof config.batchingMode === "string" ? config.batchingMode : undefined,
			summarizerModel: typeof config.summarizerModel === "string" ? config.summarizerModel : undefined,
			summarizerThinking: typeof config.summarizerThinking === "string" ? config.summarizerThinking : undefined,
		};
	} catch {
		return {};
	}
}

export function classifyPruner(config: Partial<PrunerStatus>): Pick<PrunerStatus, "cacheProfile" | "cacheProfileReason"> {
	if (config.enabled === false) return { cacheProfile: "risky", cacheProfileReason: t("pruner.reason.disabled") };
	if (config.pruneOn === "every-turn") return { cacheProfile: "bad", cacheProfileReason: t("pruner.reason.everyTurn") };
	if (config.pruneOn === "agent-message" && config.batchingMode === "agent-message") return { cacheProfile: "good", cacheProfileReason: t("pruner.reason.agentMessage") };
	if (config.pruneOn === "checkpoint") return { cacheProfile: "good", cacheProfileReason: t("pruner.reason.checkpoint") };
	if (config.pruneOn === "on-demand") return { cacheProfile: "good", cacheProfileReason: t("pruner.reason.onDemand") };
	if (config.pruneOn === "agentic-auto") return { cacheProfile: "risky", cacheProfileReason: t("pruner.reason.agenticAuto") };
	return { cacheProfile: "risky", cacheProfileReason: t("pruner.reason.unknownProfile") };
}

export function detectPruner(pi: any): PrunerStatus {
	const commandNames = namesFrom(typeof pi.getCommands === "function" ? pi.getCommands() : []);
	const toolNames = namesFrom(typeof pi.getAllTools === "function" ? pi.getAllTools() : []);
	const activeToolNames = namesFrom(typeof pi.getActiveTools === "function" ? pi.getActiveTools() : []);
	const lookupTool = toolNames.includes("context_tree_query");
	const agenticToolRegistered = toolNames.includes("context_prune");
	const agenticToolActive = activeToolNames.includes("context_prune");
	const installed = commandNames.some((name) => name === "pruner" || name.startsWith("pruner:")) || lookupTool || agenticToolRegistered;
	const config = readPrunerConfig();
	const profile = classifyPruner(config);
	return { installed, lookupTool, agenticToolRegistered, agenticToolActive, commands: commandNames.filter((name) => name === "pruner" || name.startsWith("pruner:")), ...config, ...profile };
}

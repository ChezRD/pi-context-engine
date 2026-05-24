import type { PrunerStatus } from "./types.ts";

function namesFrom(items: any[]): string[] {
	return items.map((item) => (typeof item === "string" ? item : item?.name)).filter((name): name is string => typeof name === "string");
}

export function detectPruner(pi: any): PrunerStatus {
	const commandNames = namesFrom(typeof pi.getCommands === "function" ? pi.getCommands() : []);
	const toolNames = namesFrom(typeof pi.getAllTools === "function" ? pi.getAllTools() : []);
	const installed = commandNames.some((name) => name === "pruner" || name.startsWith("pruner:")) || toolNames.includes("context_tree_query");
	const lookupTool = toolNames.includes("context_tree_query");
	const agenticTool = toolNames.includes("context_prune");
	const recommendations = installed ? recommendedPrunerCommands() : ["Install/enable pi-context-prune for long DeepSeek sessions.", ...recommendedPrunerCommands()];
	return { installed, lookupTool, agenticTool, commands: commandNames.filter((name) => name === "pruner" || name.startsWith("pruner:")), recommendations };
}

export function recommendedPrunerCommands(): string[] {
	return [
		"/pruner on",
		"/pruner prune-on agent-message",
		"/pruner batching agent-message",
		"/pruner model deepseek/deepseek-v4-flash",
		"/pruner thinking off",
	];
}

export function formatPrunerStatus(status: PrunerStatus): string {
	return [
		`pi_context_prune: ${status.installed ? "detected" : "not_detected"}`,
		`lookup_tool_context_tree_query: ${status.lookupTool ? "yes" : "no"}`,
		`agentic_tool_context_prune: ${status.agenticTool ? "yes" : "no"}`,
		`commands: ${status.commands.length ? status.commands.join(", ") : "none"}`,
		"recommended_long_session_config:",
		...status.recommendations.map((line) => `  ${line}`),
	].join("\n");
}

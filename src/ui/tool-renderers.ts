import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { extractToolResultText, type HugeResultStore, renderStoredHugeResult } from "../capper.ts";
import { t } from "../i18n/index.ts";

type BuiltInTools = ReturnType<typeof createBuiltInTools>;
type BuiltInToolName = keyof BuiltInTools;

const toolCache = new Map<string, BuiltInTools>();

function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}

function getBuiltInTools(cwd: string): BuiltInTools {
	const existing = toolCache.get(cwd);
	if (existing) return existing;
	const tools = createBuiltInTools(cwd);
	toolCache.set(cwd, tools);
	return tools;
}

function shortenPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) return `~${path.slice(home.length)}`;
	return path;
}

function firstTextLine(result: any): string {
	const text = extractToolResultText(result?.content)?.trim();
	if (!text) return "";
	return text.split(/\r?\n/)[0] ?? "";
}

function renderPlainResult(result: any, expanded: boolean, theme: any): Text {
	const text = extractToolResultText(result?.content);
	if (!text) return new Text("", 0, 0);
	const lines = text.split(/\r?\n/);
	if (!expanded) {
		const suffix = lines.length > 1 ? ` (${t("ui.tool.lines", { count: lines.length })})` : "";
		return new Text(theme.fg("muted", firstTextLine(result).slice(0, 160) + suffix), 0, 0);
	}
	const visible = lines.slice(0, 40).join("\n");
	const tail = lines.length > 40 ? `\n${theme.fg("muted", t("ui.tool.moreLines", { count: lines.length - 40 }))}` : "";
	return new Text(theme.fg("toolOutput", visible) + tail, 0, 0);
}

function registerWrappedBuiltIn(pi: ExtensionAPI, name: BuiltInToolName, store: HugeResultStore): void {
	const original = getBuiltInTools(process.cwd())[name] as any;
	pi.registerTool({
		name: original.name,
		label: original.label,
		description: original.description,
		promptSnippet: original.promptSnippet,
		promptGuidelines: original.promptGuidelines,
		parameters: original.parameters,
		prepareArguments: original.prepareArguments,
		executionMode: original.executionMode,
		async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
			const liveOriginal = getBuiltInTools(ctx.cwd)[name] as any;
			return liveOriginal.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			if (name === "bash") {
				const command = String(args.command ?? "");
				return new Text(theme.fg("toolTitle", theme.bold("$ ")) + theme.fg("accent", command.slice(0, 120)), 0, 0);
			}
			const path = shortenPath(String(args.path ?? args.pattern ?? "."));
			return new Text(theme.fg("toolTitle", theme.bold(name)) + " " + theme.fg("accent", path), 0, 0);
		},
		renderResult(result: any, { expanded }: any, theme: any) {
			const largeResult = renderStoredHugeResult(result, expanded, theme, store);
			if (largeResult) return largeResult;
			return renderPlainResult(result, expanded, theme);
		},
	} as any);
}

export function registerCompactToolRenderers(pi: ExtensionAPI, store: HugeResultStore): void {
	for (const name of ["read", "bash", "grep", "find", "ls"] as const) registerWrappedBuiltIn(pi, name, store);
}

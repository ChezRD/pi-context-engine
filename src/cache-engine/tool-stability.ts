import type { RuntimeState } from "../runtime-state.ts";
import { stableHash } from "./prefix-fingerprint.ts";
import { t } from "../i18n/index.ts";

function normalizeReadInput(input: any): void {
	if (!input || typeof input !== "object") return;
	if (typeof input.file === "string" && typeof input.path !== "string") {
		input.path = input.file;
		delete input.file;
	}
}

function isInvalidReadInput(input: any): boolean {
	return !input || typeof input !== "object" || (typeof input.path !== "string" && typeof input.file !== "string");
}

export function detectTextualToolCall(message: any): boolean {
	const content = typeof message?.content === "string" ? message.content : Array.isArray(message?.content) ? JSON.stringify(message.content) : "";
	if (!content) return false;
	if (Array.isArray(message?.toolCalls) && message.toolCalls.length > 0) return false;
	const withoutCode = content.replace(/```[\s\S]*?```/g, "");
	if (/```(?:json|typescript|ts|javascript|js)?[\s\S]*?(?:function\s*call|tool_call|context_result_lookup)[\s\S]*?```/i.test(content)) return false;
	if (/\b(?:example|пример|schema|схем[аы]|parameters|параметр[ыов]?|можно вызывать|смогу вызывать)\b/i.test(withoutCode)) return false;
	if (/\bcontext_result_lookup\s*\(/i.test(withoutCode) && !/\b(?:call|invoke|run|use|вызови|запусти|используй)\b/i.test(withoutCode)) return false;
	return /(<tool_use|tool_call|```tool|call\s+(?:the\s+)?tool|function\s*call\s*[:{(])/i.test(withoutCode);
}

export function handleToolCall(event: any, _ctx: any, state: RuntimeState): any | undefined {
	if (!state.config.enabled) return undefined;
	const toolName = event?.toolName ?? event?.name;
	const input = event?.input;
	if (toolName === "read" && isInvalidReadInput(input)) return { block: true, reason: t("engine.tool.invalidArgs") };
	if (toolName === "read") normalizeReadInput(input);
	const key = stableHash({ tool: toolName, input });
	const last = state.engine.recentToolCalls.get(key);
	if (last !== undefined && state.engine.turnIndex - last < 2) {
		return { block: true, reason: t("engine.tool.duplicate") };
	}
	state.engine.recentToolCalls.set(key, state.engine.turnIndex);
	return undefined;
}

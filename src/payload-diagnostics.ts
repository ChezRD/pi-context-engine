import type { PayloadDiagnostics } from "./types.ts";
import { t } from "./i18n/index.ts";

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: unknown): number {
	try {
		return Buffer.byteLength(JSON.stringify(value));
	} catch {
		return 0;
	}
}

function hasToolCalls(message: unknown): boolean {
	if (!isObject(message)) return false;
	if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return true;
	const content = Array.isArray(message.content) ? message.content : [];
	return content.some((part) => isObject(part) && (part.type === "toolCall" || part.type === "tool_use"));
}

function roleOf(message: unknown): string {
	return isObject(message) && typeof message.role === "string" ? message.role : "unknown";
}

export function inspectProviderPayload(body: unknown, meta?: { requestIndex?: number }): PayloadDiagnostics {
	const payload = isObject(body) ? body : {};
	const messages = Array.isArray(payload.messages) ? payload.messages : [];
	const tools = Array.isArray(payload.tools) ? payload.tools : [];
	let assistantMessages = 0;
	let assistantMissingReasoningContent = 0;
	let assistantToolCallMessages = 0;
	let toolResultMessages = 0;
	for (const message of messages) {
		if (!isObject(message)) continue;
		if (message.role === "assistant") {
			assistantMessages++;
			if (hasToolCalls(message)) assistantToolCallMessages++;
			if (!("reasoning_content" in message)) assistantMissingReasoningContent++;
		}
		if (message.role === "tool") toolResultMessages++;
	}
	const lastMessage = messages[messages.length - 1];
	const thinking = isObject(payload.thinking) ? payload.thinking : undefined;
	const streamOptions = isObject(payload.stream_options) ? payload.stream_options : undefined;
	return {
		createdAt: Date.now(),
		requestIndex: meta?.requestIndex,
		messageCount: messages.length,
		toolCount: tools.length,
		payloadBytes: byteLength(body),
		thinkingType: typeof thinking?.type === "string" ? thinking.type : undefined,
		reasoningEffort: typeof payload.reasoning_effort === "string" ? payload.reasoning_effort : undefined,
		includeUsage: typeof streamOptions?.include_usage === "boolean" ? streamOptions.include_usage : undefined,
		promptCacheKey: typeof payload.prompt_cache_key === "string" && payload.prompt_cache_key.length > 0,
		assistantMessages,
		assistantMissingReasoningContent,
		assistantToolCallMessages,
		toolResultMessages,
		lastMessageRole: roleOf(lastMessage),
		lastMessageHasToolCalls: hasToolCalls(lastMessage),
		lastMessageToolCallId: isObject(lastMessage) && typeof lastMessage.tool_call_id === "string" ? lastMessage.tool_call_id : undefined,
		tailRoles: messages.slice(-8).map(roleOf),
	};
}

export function formatPayloadDiagnostics(diag: PayloadDiagnostics | undefined, config?: unknown): string {
	if (!diag) return [t(config, "payload.title"), `  ${t(config, "payload.none")}`, `  ${t(config, "payload.runTurn")}`].join("\n");
	const reasoningStatus = diag.assistantMissingReasoningContent === 0
		? t(config, "payload.reasoningOk")
		: t(config, "payload.reasoningMissing", { count: diag.assistantMissingReasoningContent });
	return [
		t(config, "payload.title"),
		`  ${t(config, "payload.messages", { count: diag.messageCount })}`,
		`  ${t(config, "payload.tools", { count: diag.toolCount })}`,
		`  ${t(config, "payload.size", { bytes: diag.payloadBytes })}`,
		`  ${t(config, "payload.thinking", { value: diag.thinkingType ?? t(config, "payload.notSet") })}`,
		`  ${t(config, "payload.reasoningEffort", { value: diag.reasoningEffort ?? t(config, "payload.notSet") })}`,
		`  ${t(config, "payload.includeUsage", { value: diag.includeUsage === undefined ? t(config, "payload.unknown") : diag.includeUsage ? t(config, "payload.yes") : t(config, "payload.no") })}`,
		`  ${t(config, "payload.promptCacheKey", { value: diag.promptCacheKey ? t(config, "payload.present") : t(config, "payload.notPresent") })}`,
		`  ${t(config, "payload.assistantMessages", { count: diag.assistantMessages })}`,
		`  ${t(config, "payload.reasoningCheck", { status: reasoningStatus })}`,
		`  request #${diag.requestIndex ?? "?"} · tail=${diag.tailRoles?.join(" > ") ?? "unknown"} · last=${diag.lastMessageRole ?? "unknown"}${diag.lastMessageToolCallId ? `:${diag.lastMessageToolCallId}` : ""}`,
	].join("\n");
}

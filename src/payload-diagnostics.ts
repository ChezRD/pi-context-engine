import type { PayloadDiagnostics } from "./types.ts";

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

export function inspectProviderPayload(body: unknown): PayloadDiagnostics {
	const payload = isObject(body) ? body : {};
	const messages = Array.isArray(payload.messages) ? payload.messages : [];
	const tools = Array.isArray(payload.tools) ? payload.tools : [];
	let assistantMessages = 0;
	let assistantMissingReasoningContent = 0;
	for (const message of messages) {
		if (!isObject(message) || message.role !== "assistant") continue;
		assistantMessages++;
		if (!("reasoning_content" in message)) assistantMissingReasoningContent++;
	}
	const thinking = isObject(payload.thinking) ? payload.thinking : undefined;
	const streamOptions = isObject(payload.stream_options) ? payload.stream_options : undefined;
	return {
		createdAt: Date.now(),
		messageCount: messages.length,
		toolCount: tools.length,
		payloadBytes: byteLength(body),
		thinkingType: typeof thinking?.type === "string" ? thinking.type : undefined,
		reasoningEffort: typeof payload.reasoning_effort === "string" ? payload.reasoning_effort : undefined,
		includeUsage: typeof streamOptions?.include_usage === "boolean" ? streamOptions.include_usage : undefined,
		promptCacheKey: typeof payload.prompt_cache_key === "string" && payload.prompt_cache_key.length > 0,
		assistantMessages,
		assistantMissingReasoningContent,
	};
}

export function formatPayloadDiagnostics(diag: PayloadDiagnostics | undefined): string {
	if (!diag) return "payload_diagnostics: unavailable";
	return [
		`payload_messages: ${diag.messageCount}`,
		`payload_tools: ${diag.toolCount}`,
		`payload_bytes: ${diag.payloadBytes}`,
		`deepseek_thinking_type: ${diag.thinkingType ?? "n/a"}`,
		`reasoning_effort: ${diag.reasoningEffort ?? "n/a"}`,
		`include_usage: ${diag.includeUsage === undefined ? "n/a" : String(diag.includeUsage)}`,
		`prompt_cache_key: ${diag.promptCacheKey ? "yes" : "no"}`,
		`assistant_messages: ${diag.assistantMessages}`,
		`assistant_missing_reasoning_content: ${diag.assistantMissingReasoningContent}`,
	].join("\n");
}

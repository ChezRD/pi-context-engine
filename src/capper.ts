import { Type } from "typebox";
import type { ExtensionConfig } from "./config.ts";

export interface StoredResult {
	ref: string;
	toolCallId?: string;
	toolName?: string;
	bytes: number;
	text: string;
	createdAt: number;
}

export class HugeResultStore {
	private counter = 0;
	private byRef = new Map<string, StoredResult>();

	remember(text: string, toolCallId?: string, toolName?: string): StoredResult {
		const ref = `dsc-${(++this.counter).toString(36)}`;
		const record = { ref, toolCallId, toolName, bytes: Buffer.byteLength(text), text, createdAt: Date.now() };
		this.byRef.set(ref, record);
		return record;
	}

	get(ref: string): StoredResult | undefined {
		return this.byRef.get(ref);
	}
}

export function extractToolResultText(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	const text = content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && (part as any).type === "text") return String((part as any).text ?? "");
			return "";
		})
		.filter(Boolean)
		.join("\n");
	return text || undefined;
}

export function buildPreview(record: StoredResult, config: ExtensionConfig): string {
	const head = record.text.slice(0, config.hugeResultHeadChars);
	const tail = config.hugeResultTailChars > 0 ? record.text.slice(-config.hugeResultTailChars) : "";
	return [
		"[deepseek-cache: large tool result elided]",
		`ref: ${record.ref}`,
		`tool: ${record.toolName ?? "unknown"}`,
		`bytes: ${record.bytes}`,
		"",
		head,
		tail ? "\n...\n" : "",
		tail,
		"",
		`Use deepseek_cache_lookup with ref "${record.ref}" to recover full output.`,
	].join("\n");
}

export function registerLookupTool(pi: any, store: HugeResultStore): void {
	pi.registerTool?.({
		name: "deepseek_cache_lookup",
		label: "DeepSeek cache lookup",
		description: "Retrieve full tool output elided by pi-deepseek-cache huge-result capper.",
		promptSnippet: "Retrieve full tool output elided by DeepSeek cache capper.",
		parameters: Type.Object({ ref: Type.String({ description: "Reference like dsc-1." }) }),
		async execute(_toolCallId: string, params: { ref: string }) {
			const record = store.get(params.ref);
			return { content: [{ type: "text", text: record ? record.text : `Ref not found: ${params.ref}` }], details: { ref: params.ref, found: Boolean(record) } };
		},
	});
}

export function maybeCapToolResult(event: any, config: ExtensionConfig, store: HugeResultStore): any | undefined {
	if (!config.hugeResultCapper) return undefined;
	const text = extractToolResultText(event?.content);
	if (!text) return undefined;
	const bytes = Buffer.byteLength(text);
	if (bytes < config.hugeResultChars) return undefined;
	const record = store.remember(text, event?.toolCallId, event?.toolName);
	return { content: [{ type: "text", text: buildPreview(record, config) }], details: { elidedBy: "pi-deepseek-cache", ref: record.ref, bytes } };
}

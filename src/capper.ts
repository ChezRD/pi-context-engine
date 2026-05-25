import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import type { ExtensionConfig } from "./config.ts";
import { buildModelVisibleContext, extractModelVisibleMetadata, extractModelVisibleSection } from "./model-visible.ts";

export const CONTEXT_RESULT_LOOKUP_TOOL = "context_result_lookup";
export const CUSTOM_TYPE_HUGE_RESULT = "context-engine-huge-result";
const MAX_INLINE_PREVIEW_CHARS = 2_000;
const MAX_SNIPPET_LINES = 8;

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
	private persist?: (record: StoredResult) => void;

	constructor(persist?: (record: StoredResult) => void) {
		this.persist = persist;
	}

	setPersist(persist: (record: StoredResult) => void): void {
		this.persist = persist;
	}

	remember(text: string, toolCallId?: string, toolName?: string): StoredResult {
		const ref = `dsc-${refSlug(toolName)}-${(++this.counter).toString(36)}`;
		const record = { ref, toolCallId, toolName, bytes: Buffer.byteLength(text), text, createdAt: Date.now() };
		this.byRef.set(ref, record);
		this.persist?.(record);
		return record;
	}

	get(ref: string): StoredResult | undefined {
		return this.byRef.get(ref);
	}

	restore(record: StoredResult): void {
		if (!record?.ref || typeof record.text !== "string") return;
		this.byRef.set(record.ref, record);
		const parsed = Number.parseInt(record.ref.split("-").at(-1) ?? "", 36);
		if (Number.isFinite(parsed)) this.counter = Math.max(this.counter, parsed);
	}
}

export function persistHugeResult(pi: any, record: StoredResult): void {
	if (typeof pi?.appendEntry !== "function") return;
	pi.appendEntry(CUSTOM_TYPE_HUGE_RESULT, { version: 1, record });
}

export function restoreHugeResultsFromSession(ctx: any, store: HugeResultStore): number {
	const entries = ctx?.sessionManager?.getEntries?.() ?? ctx?.sessionManager?.getBranch?.() ?? [];
	let count = 0;
	for (const entry of entries) {
		if (entry?.type === "custom" && entry?.customType === CUSTOM_TYPE_HUGE_RESULT && entry?.data?.version === 1 && entry?.data?.record) {
			store.restore(entry.data.record as StoredResult);
			count += 1;
		}
	}
	return count;
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
	const headBudget = Math.min(config.hugeResultHeadChars, Math.floor(MAX_INLINE_PREVIEW_CHARS * 0.7));
	const tailBudget = Math.min(config.hugeResultTailChars, Math.max(0, MAX_INLINE_PREVIEW_CHARS - headBudget));
	const head = firstLines(record.text.slice(0, headBudget), MAX_SNIPPET_LINES);
	const tail = tailBudget > 0 ? lastLines(record.text.slice(-tailBudget), Math.max(2, Math.floor(MAX_SNIPPET_LINES / 2))) : "";
	return buildModelVisibleContext({
		kind: "context_result_truncated",
		ui: "custom-rendered",
		metadata: {
			reason: "tool_output_exceeds_huge_result_limit",
			original_bytes: record.bytes,
			preview_head_chars: headBudget,
			preview_tail_chars: tailBudget,
			source_tool: record.toolName ?? "unknown",
			ref: record.ref,
			ref_label: `[ref ${record.ref}]`,
			recovery: {
				tool: CONTEXT_RESULT_LOOKUP_TOOL,
				arguments: { ref: record.ref, offset: 0, limit: record.bytes },
			},
		},
		sections: [
			{ name: "lookup", content: lookupHeader({ ref: record.ref, offset: 0, limit: record.text.length, returnedChars: record.text.length, totalChars: record.text.length, bytes: record.bytes, hasMore: false }) },
			{ name: "preview", content: [head, tail ? "\n…\n" : "", tail].join("\n") },
		],
	});
}

export function isHugeResultPreview(result: any): boolean {
	if (result?.details?.elidedBy === "pi-context-engine") return true;
	const text = extractToolResultText(result?.content);
	return extractModelVisibleMetadata(text ?? "")?.kind === "context_result_truncated";
}

export function renderStoredHugeResult(result: any, expanded: boolean, theme: any, store: HugeResultStore): Text | undefined {
	if (!isHugeResultPreview(result)) return undefined;
	const textContent = extractToolResultText(result?.content) ?? "";
	const metadata = extractModelVisibleMetadata(textContent);
	const ref = String(result?.details?.ref ?? metadata?.ref ?? "");
	const record = ref ? store.get(ref) : undefined;
	const text = record?.text ?? extractModelVisibleSection(textContent, "preview") ?? "";
	const lines = text.split(/\r?\n/);
	const source = record?.toolName ?? metadata?.source_tool ?? "unknown";
	const bytes = record ? `${record.bytes} bytes` : "preview";
	const lookup = ref ? ` ${theme.fg("accent", `[ref ${ref}]`)} ${theme.fg("muted", `source ${source}`)}` : "";
	const header = theme.fg("muted", `large output: ${bytes}`) + lookup;
	if (!expanded) {
		const visible = lines.slice(0, 12).join("\n");
		const recovery = ref ? `\n${theme.fg("muted", `Full output: ${CONTEXT_RESULT_LOOKUP_TOOL} [ref=${ref}]`)}` : "";
		const more = lines.length > 12 ? `\n${theme.fg("muted", `... ${lines.length - 12} more lines; Ctrl+O to expand`)}` : "";
		return new Text(`${header}${recovery}\n${theme.fg("toolOutput", visible)}${more}`, 0, 0);
	}
	return new Text(`${header}\n${theme.fg("toolOutput", text)}`, 0, 0);
}

function refSlug(toolName: string | undefined): string {
	const slug = String(toolName ?? "result")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 20);
	return slug || "result";
}

function lookupHeader(details: { ref: string; offset?: number; limit?: number; returnedChars?: number; totalChars?: number; bytes?: number; hasMore?: boolean; nextOffset?: number }): string {
	const kind = details.limit === undefined && (details.offset ?? 0) === 0 ? "full" : "slice";
	const offset = details.offset ?? 0;
	const returned = details.returnedChars ?? 0;
	const end = details.returnedChars === undefined ? undefined : offset + returned;
	const parts = [`kind=${kind}`, `ref=${details.ref}`];
	if (details.offset !== undefined) parts.push(`offset=${details.offset}`);
	if (details.limit !== undefined) parts.push(`limit=${details.limit}`);
	if (end !== undefined) parts.push(`range=${offset}:${end}`);
	if (details.returnedChars !== undefined) parts.push(`returned_chars=${details.returnedChars}`);
	if (details.totalChars !== undefined) parts.push(`total_chars=${details.totalChars}`);
	if (details.bytes !== undefined) parts.push(`bytes=${details.bytes}`);
	if (details.hasMore !== undefined) parts.push(`has_more=${details.hasMore ? "true" : "false"}`);
	if (details.nextOffset !== undefined) parts.push(`next_offset=${details.nextOffset}`);
	return `[${CONTEXT_RESULT_LOOKUP_TOOL} ${parts.join(" ")}]`;
}

function lookupDisplay(details: { ref?: string; offset?: number; limit?: number; returnedChars?: number; totalChars?: number; bytes?: number; hasMore?: boolean }): string {
	const ref = details.ref ?? "?";
	const offset = details.offset ?? 0;
	const returned = details.returnedChars;
	const end = returned === undefined ? undefined : offset + returned;
	const total = details.totalChars;
	const range = end === undefined ? `from ${offset}` : `${offset}-${end}`;
	const totalText = total === undefined ? "" : ` / ${total} chars`;
	const limitText = details.limit === undefined ? "" : ` · limit ${details.limit}`;
	const sizeText = details.bytes === undefined ? "" : ` · ${details.bytes} bytes`;
	const moreText = details.hasMore === undefined ? "" : details.hasMore ? " · more available" : " · end";
	return `${ref} · chars ${range}${totalText}${limitText}${sizeText}${moreText}`;
}

function firstLines(text: string, maxLines: number): string {
	return text.split(/\r?\n/).slice(0, maxLines).join("\n");
}

function lastLines(text: string, maxLines: number): string {
	const lines = text.split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

export function registerLookupTool(pi: any, store: HugeResultStore): void {
	pi.registerTool?.({
		name: CONTEXT_RESULT_LOOKUP_TOOL,
		label: "context result lookup",
		description: "Retrieve full tool output elided by pi-context-engine huge-result capper.",
		promptSnippet: "Retrieve full tool output elided by pi-context-engine huge-result capper.",
		parameters: Type.Object({
			ref: Type.String({ description: "Reference like dsc-1." }),
			offset: Type.Optional(Type.Number({ description: "Start character offset within the stored result." })),
			limit: Type.Optional(Type.Number({ description: "Maximum number of characters to return." })),
		}),
		async execute(_toolCallId: string, params: { ref: string; offset?: number; limit?: number }) {
			const record = store.get(params.ref);
			if (!record) return { content: [{ type: "text", text: `Ref not found: ${params.ref}` }], details: { ref: params.ref, found: false } };
			const offset = Math.max(0, Math.floor(params.offset ?? 0));
			const limit = params.limit === undefined ? undefined : Math.max(0, Math.floor(params.limit));
			const text = limit === undefined ? record.text.slice(offset) : record.text.slice(offset, offset + limit);
			const nextOffset = offset + text.length;
			const hasMore = nextOffset < record.text.length;
			const details = { ref: params.ref, found: true, offset, limit, bytes: record.bytes, returnedChars: text.length, totalChars: record.text.length, hasMore, nextOffset: hasMore ? nextOffset : undefined };
			return { content: [{ type: "text", text: `${lookupHeader(details)}\n${text}` }], details };
		},
		renderCall(args: { ref?: string; offset?: number; limit?: number }, theme: any) {
			return new Text(theme.fg("toolTitle", theme.bold(CONTEXT_RESULT_LOOKUP_TOOL)) + " " + theme.fg("accent", lookupDisplay({
				ref: String(args.ref ?? "?"),
				offset: args.offset,
				limit: args.limit,
			})), 0, 0);
		},
		renderResult(result: any, { expanded }: any, theme: any) {
			const details = result?.details ?? {};
			const header = lookupHeader({
				ref: String(details.ref ?? "?"),
				offset: details.offset,
				limit: details.limit,
				returnedChars: details.returnedChars,
				totalChars: details.totalChars,
				bytes: details.bytes,
				hasMore: details.hasMore,
				nextOffset: details.nextOffset,
			});
			const display = lookupDisplay({
				ref: String(details.ref ?? "?"),
				offset: details.offset,
				limit: details.limit,
				returnedChars: details.returnedChars,
				totalChars: details.totalChars,
				bytes: details.bytes,
				hasMore: details.hasMore,
			});
			const text = extractToolResultText(result?.content);
			if (!text) return new Text("", 0, 0);
			if (!expanded) {
				const payload = text.replace(header, "").trimStart();
				const lines = payload.split(/\r?\n/);
				const visible = lines.slice(0, 12).join("\n");
				const more = lines.length > 12 ? `\n${theme.fg("muted", `... ${lines.length - 12} more lines; Ctrl+O to expand`)}` : "";
				return new Text(`${theme.fg("muted", display)}\n${theme.fg("toolOutput", visible)}${more}`, 0, 0);
			}
			return new Text(theme.fg("toolOutput", text.replace(header, "").trimStart()), 0, 0);
		},
	});
}

export function maybeCapToolResult(event: any, config: ExtensionConfig, store: HugeResultStore): any | undefined {
	if (!config.hugeResultCapper) return undefined;
	if (isContextResultLookupEvent(event)) return undefined;
	const text = extractToolResultText(event?.content);
	if (!text) return undefined;
	const bytes = Buffer.byteLength(text);
	if (bytes < config.hugeResultChars) return undefined;
	const record = store.remember(text, event?.toolCallId, event?.toolName);
	return { content: [{ type: "text", text: buildPreview(record, config) }], details: { elidedBy: "pi-context-engine", ref: record.ref, bytes } };
}

function isContextResultLookupEvent(event: any): boolean {
	const names = [
		event?.toolName,
		event?.name,
		event?.tool?.name,
		event?.message?.toolName,
		event?.result?.toolName,
	].filter(Boolean);
	if (names.includes(CONTEXT_RESULT_LOOKUP_TOOL)) return true;
	const details = event?.details ?? event?.result?.details;
	return Boolean(details?.ref && typeof details?.found === "boolean");
}

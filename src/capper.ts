import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, type ExtensionConfig } from "./config.ts";
import { t } from "./i18n/index.ts";
import { safeAppendEntry } from "./stale-context.ts";
import { buildModelVisibleContext, extractModelVisibleMetadata, extractModelVisibleSection } from "./model-visible.ts";
import { buildContextResultLookupHeader, CONTEXT_RESULT_LOOKUP_TOOL } from "./projection/harness-content.ts";

export { CONTEXT_RESULT_LOOKUP_TOOL };
export const CUSTOM_TYPE_HUGE_RESULT = "context-engine-huge-result";
const MAX_SNIPPET_LINES = 4;
const LOOKUP_PROMPT_SNIPPET = "Retrieve full tool output elided by pi-context-engine huge-result capper.";

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
	safeAppendEntry(pi, CUSTOM_TYPE_HUGE_RESULT, { version: 1, record });
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
	const segmentChars = configuredPositiveInt(config.hugeResultChars, DEFAULT_CONFIG.hugeResultChars);
	const configuredHeadBudget = configuredNonNegativeInt(config.hugeResultHeadChars, DEFAULT_CONFIG.hugeResultHeadChars);
	const configuredTailBudget = configuredNonNegativeInt(config.hugeResultTailChars, DEFAULT_CONFIG.hugeResultTailChars);
	const headBudget = Math.min(configuredHeadBudget, segmentChars);
	const tailBudget = Math.min(configuredTailBudget, Math.max(0, segmentChars - headBudget));
	const fullPreviewFits = record.text.length <= headBudget + tailBudget;
	const head = fullPreviewFits ? record.text : firstLines(record.text.slice(0, headBudget), MAX_SNIPPET_LINES);
	const tail = !fullPreviewFits && tailBudget > 0 ? lastLines(record.text.slice(-tailBudget), Math.max(2, Math.floor(MAX_SNIPPET_LINES / 2))) : "";
	const visibleChars = fullPreviewFits ? record.text.length : head.length + tail.length;
	const fullResultFitsConfig = record.text.length <= segmentChars;
	const initialLimit = Math.min(segmentChars, record.text.length);
	return buildModelVisibleContext({
		kind: "context_result_truncated",
		ui: "custom-rendered",
		instructions: buildModelInstruction(record, {
			fullResultFitsConfig,
			headChars: head.length,
			tailChars: tail.length,
			visibleChars,
			segmentChars,
		}),
		metadata: {
			reason: "tool_output_exceeds_huge_result_limit",
			original_bytes: record.bytes,
			total_chars: record.text.length,
			preview_head_chars: headBudget,
			preview_tail_chars: tailBudget,
			visible_preview_chars: visibleChars,
			full_output_visible: fullResultFitsConfig,
			preview_is_complete: fullResultFitsConfig,
			required_recheck_for_complete_claim: !fullResultFitsConfig,
			evidence_kind: fullResultFitsConfig ? "complete_tool_output" : "partial_tool_output_preview",
			claim_strength: fullResultFitsConfig ? "strong" : "weak",
			valid_claims: fullResultFitsConfig
				? ["facts visible in this complete tool output", "the stored ref can revisit this same output"]
				: ["facts visible in the shown excerpt", "metadata about why this output was capped"],
			invalid_claims: fullResultFitsConfig
				? ["facts about current filesystem state after this tool result without re-checking"]
				: ["full read", "no matches", "no tests", "complete coverage", "all files checked", "exact counts across hidden ranges"],
			source_tool: record.toolName ?? "unknown",
			ref: record.ref,
			ref_label: `[ref ${record.ref}]`,
		},
		sections: [
			{ name: "preview_metadata", content: buildPreviewMetadata({ ref: record.ref, returnedChars: Math.min(visibleChars, initialLimit), totalChars: record.text.length, bytes: record.bytes, hasMore: !fullResultFitsConfig }) },
			{ name: "preview", content: [head, tail ? "\n…\n" : "", tail].join("\n") },
		],
	});
}

function buildModelInstruction(record: StoredResult, segment: { fullResultFitsConfig: boolean; headChars: number; tailChars: number; visibleChars: number; segmentChars: number }): string {
	const subject = /^(read|cat|file|context_parallel_read)$/i.test(record.toolName ?? "") ? "file" : "tool output";
	const totalSegments = Math.max(1, Math.ceil(record.text.length / segment.segmentChars));
	if (segment.fullResultFitsConfig) {
		return [
			`This is the complete ${subject} (${record.bytes} bytes); no other segments exist.`,
			`Do not claim facts about current filesystem state after this tool result without re-checking.`,
		].join(" ");
	}
	const omittedChars = Math.max(0, record.text.length - segment.visibleChars);
	const shape = segment.tailChars > 0
		? `shown excerpt has ${segment.headChars} head chars and ${segment.tailChars} tail chars; about ${omittedChars} chars in the middle are not shown`
		: `shown excerpt has ${segment.headChars} head chars; about ${omittedChars} chars after it are not shown`;
	const remainingSegments = Math.max(0, totalSegments - 1);
	const continuation = record.toolName === "read"
		? "For files, call read again with the original path and a smaller line range using offset/limit, following any continuation marker from the read output."
		: "For command output, rerun the original command with a narrower scope, stronger filters, explicit counts, or output limits that directly prove the claim.";
	return [
		`This is a bounded preview of a ${record.bytes}-byte ${subject}; configured cap is ${segment.segmentChars} chars.`,
		`${shape}.`,
		`${remainingSegments} hidden segment(s) are not present in this message.`,
		continuation,
		"This preview is not a full read and is not enough for audit, coverage, count, or exhaustive-search claims.",
		"Do not say you fully read, checked all tests, checked every file, or completed coverage unless you run separate exhaustive listings/searches/counts that prove it.",
		"Do not claim facts about hidden ranges until you re-check them with ordinary tools.",
	].join(" ");
}

function buildPreviewMetadata(details: { ref: string; returnedChars: number; totalChars: number; bytes: number; hasMore: boolean }): string {
	return `<!-- pi-context-engine: huge_result_preview ref=${details.ref} returned_chars=${details.returnedChars} total_chars=${details.totalChars} bytes=${details.bytes} has_more=${details.hasMore ? "true" : "false"} -->`;
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
	if (!expanded) {
		const visible = lines.slice(0, 12).join("\n");
		const more = lines.length > 12 ? `\n${theme.fg("muted", t("capper.render.moreLines", { count: lines.length - 12 }))}` : "";
		return new Text(`${theme.fg("toolOutput", visible)}${more}`, 0, 0);
	}
	return new Text(theme.fg("toolOutput", text), 0, 0);
}

function refSlug(toolName: string | undefined): string {
	const slug = String(toolName ?? "result")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 20);
	return slug || "result";
}

function lookupCallParams(args: { ref?: string; offset?: number; limit?: number }): string {
	const parts = [`ref=${args.ref ?? "?"}`];
	if (args.offset !== undefined) parts.push(`offset=${args.offset}`);
	if (args.limit !== undefined) parts.push(`limit=${args.limit}`);
	return `[${parts.join(" ")}]`;
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
		label: t("tool.lookup.label"),
		description: t("tool.lookup.description"),
		promptSnippet: LOOKUP_PROMPT_SNIPPET,
		parameters: Type.Object({
			ref: Type.String({ description: t("tool.lookup.param.ref") }),
			offset: Type.Optional(Type.Number({ description: t("tool.lookup.param.offset") })),
			limit: Type.Optional(Type.Number({ description: t("tool.lookup.param.limit") })),
		}),
		async execute(_toolCallId: string, params: { ref: string; offset?: number; limit?: number }) {
			const record = store.get(params.ref);
			if (!record) return { content: [{ type: "text", text: t("tool.lookup.notFound", { ref: params.ref }) }], details: { ref: params.ref, found: false } };
			const offset = Math.max(0, Math.floor(params.offset ?? 0));
			const limit = params.limit === undefined ? undefined : Math.max(0, Math.floor(params.limit));
			const text = limit === undefined ? record.text.slice(offset) : record.text.slice(offset, offset + limit);
			const nextOffset = offset + text.length;
			const hasMore = nextOffset < record.text.length;
			const details = { ref: params.ref, found: true, offset, limit, bytes: record.bytes, returnedChars: text.length, totalChars: record.text.length, hasMore, nextOffset: hasMore ? nextOffset : undefined };
			return { content: [{ type: "text", text: `${buildContextResultLookupHeader(details)}\n${text}` }], details };
		},
		renderCall(args: { ref?: string; offset?: number; limit?: number }, theme: any) {
			return new Text(theme.fg("toolTitle", theme.bold(CONTEXT_RESULT_LOOKUP_TOOL)) + " " + theme.fg("accent", lookupCallParams({
				ref: String(args.ref ?? "?"),
				offset: args.offset,
				limit: args.limit,
			})), 0, 0);
		},
		renderResult(result: any, { expanded }: any, theme: any) {
			const details = result?.details ?? {};
			const header = buildContextResultLookupHeader({
				ref: String(details.ref ?? "?"),
				offset: details.offset,
				limit: details.limit,
				returnedChars: details.returnedChars,
				totalChars: details.totalChars,
				bytes: details.bytes,
				hasMore: details.hasMore,
				nextOffset: details.nextOffset,
			});
			const text = extractToolResultText(result?.content);
			if (!text) return new Text("", 0, 0);
			if (!expanded) {
				const payload = text.replace(header, "").trimStart();
				const lines = payload.split(/\r?\n/);
				const visible = lines.slice(0, 12).join("\n");
				const more = lines.length > 12 ? `\n${theme.fg("muted", t("capper.render.moreLines", { count: lines.length - 12 }))}` : "";
				return new Text(`${theme.fg("toolOutput", visible)}${more}`, 0, 0);
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
	const threshold = configuredPositiveInt(config.hugeResultChars, DEFAULT_CONFIG.hugeResultChars);
	if (text.length <= threshold) return undefined;
	const record = store.remember(text, event?.toolCallId, event?.toolName);
	return { content: [{ type: "text", text: buildPreview(record, config) }], details: { elidedBy: "pi-context-engine", ref: record.ref, bytes } };
}

function configuredPositiveInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function configuredNonNegativeInt(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
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

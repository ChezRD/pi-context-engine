import { extractModelVisibleSection, isModelVisibleContext } from "../model-visible.ts";

export const CONTEXT_RESULT_LOOKUP_TOOL = "context_result_lookup";
export const DUPLICATE_SKIP_INTERNAL_MARKER = "[context-engine duplicate tool call skipped]";

export interface HarnessResultFacts {
	kind: "full" | "slice" | "preview" | "duplicate-skip" | "unknown";
	sourceTool?: string;
	ref?: string;
	offset?: number;
	limit?: number;
	range?: string;
	returnedChars?: number;
	totalChars?: number;
	totalBytes?: number;
	hasMore?: boolean;
	nextOffset?: number;
	continuation?: "none" | "has-more" | "unknown";
	lineMappingProven?: boolean;
	duplicateSkip?: boolean;
}

export function buildContextResultLookupHeader(details: { ref: string; offset?: number; limit?: number; returnedChars?: number; totalChars?: number; bytes?: number; totalBytes?: number; hasMore?: boolean; nextOffset?: number }): string {
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
	const totalBytes = details.totalBytes ?? details.bytes;
	if (totalBytes !== undefined) parts.push(`bytes=${totalBytes}`);
	if (details.hasMore !== undefined) parts.push(`has_more=${details.hasMore ? "true" : "false"}`);
	if (details.nextOffset !== undefined) parts.push(`next_offset=${details.nextOffset}`);
	return `[${CONTEXT_RESULT_LOOKUP_TOOL} ${parts.join(" ")}]`;
}

export function parseContextResultLookupHeader(header: string | undefined): HarnessResultFacts | undefined {
	if (!header) return undefined;
	const trimmed = header.trim();
	if (!trimmed.startsWith(`[${CONTEXT_RESULT_LOOKUP_TOOL} `) || !trimmed.endsWith("]")) return undefined;
	const facts: HarnessResultFacts = { kind: "unknown" };
	const body = trimmed.replace(new RegExp(`^\\[${CONTEXT_RESULT_LOOKUP_TOOL}\\s*`), "").replace(/\]$/, "");
	for (const token of body.split(/\s+/)) {
		const [key, rawValue] = token.split("=");
		if (!key || rawValue == null) continue;
		const value = parseHarnessValue(rawValue);
		switch (key) {
			case "kind":
				facts.kind = value === "full" || value === "slice" || value === "preview" ? value : "unknown";
				break;
			case "ref":
				facts.ref = String(value);
				break;
			case "offset":
				if (typeof value === "number") facts.offset = value;
				break;
			case "limit":
				if (typeof value === "number") facts.limit = value;
				break;
			case "range":
				facts.range = String(value);
				break;
			case "returned":
			case "returned_chars":
				if (typeof value === "number") facts.returnedChars = value;
				break;
			case "total_chars":
				if (typeof value === "number") facts.totalChars = value;
				break;
			case "bytes":
			case "total_bytes":
				if (typeof value === "number") facts.totalBytes = value;
				break;
			case "has_more":
				if (typeof value === "boolean") facts.hasMore = value;
				break;
			case "next_offset":
				if (typeof value === "number") facts.nextOffset = value;
				break;
		}
	}
	if (facts.kind === "unknown" && facts.ref) facts.kind = facts.limit === undefined && (facts.offset ?? 0) === 0 ? "full" : "slice";
	facts.continuation = facts.hasMore === true ? "has-more" : facts.hasMore === false ? "none" : "unknown";
	return facts.ref ? facts : undefined;
}

export function firstContextResultLookupHeader(text: string | undefined): string | undefined {
	const firstLine = text?.trimStart().split(/\r?\n/, 1)[0]?.trim();
	return firstLine?.startsWith(`[${CONTEXT_RESULT_LOOKUP_TOOL} `) ? firstLine : undefined;
}

export function extractHarnessResultFacts(text: string | undefined): HarnessResultFacts | undefined {
	if (!text) return undefined;
	const trimmed = text.trim();
	if (isDuplicateSkipResult(trimmed)) return { kind: "duplicate-skip", duplicateSkip: true, continuation: "none" };
	if (isModelVisibleContext(trimmed)) {
		const lookup = extractModelVisibleSection(trimmed, "slice_metadata") ?? extractModelVisibleSection(trimmed, "lookup");
		const facts = parseContextResultLookupHeader(firstContextResultLookupHeader(lookup));
		if (facts) return facts;
		return { kind: "preview", continuation: "unknown" };
	}
	return parseContextResultLookupHeader(firstContextResultLookupHeader(trimmed));
}

export function normalizeHarnessFactsForSummary(facts: HarnessResultFacts | undefined): string | undefined {
	if (!facts || facts.duplicateSkip) return undefined;
	const parts: string[] = [];
	if (facts.kind && facts.kind !== "unknown") parts.push(`kind=${facts.kind}`);
	if (facts.ref) parts.push(`ref=${facts.ref}`);
	if (facts.offset !== undefined) parts.push(`offset=${facts.offset}`);
	if (facts.limit !== undefined) parts.push(`limit=${facts.limit}`);
	if (facts.range !== undefined) parts.push(`range=${facts.range}`);
	if (facts.returnedChars !== undefined) parts.push(`returned_chars=${facts.returnedChars}`);
	if (facts.totalChars !== undefined) parts.push(`total_chars=${facts.totalChars}`);
	if (facts.totalBytes !== undefined) parts.push(`total_bytes=${facts.totalBytes}`);
	if (facts.hasMore !== undefined) parts.push(`has_more=${facts.hasMore ? "true" : "false"}`);
	if (facts.nextOffset !== undefined) parts.push(`next_offset=${facts.nextOffset}`);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

export function parseLegacyDuplicateSkipMarker(text: string): boolean {
	const normalized = text.trim();
	return [
		/^duplicate tool call suppressed to avoid cache\/context churn$/i,
		/^дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации\/шума в контексте$/i,
	].some((pattern) => pattern.test(normalized));
}

export function isDuplicateSkipResult(text: string): boolean {
	const normalized = text.trim();
	return normalized === DUPLICATE_SKIP_INTERNAL_MARKER || parseLegacyDuplicateSkipMarker(normalized);
}

export function stripLegacyUiContinuationHint(body: string | undefined): { body?: string; hasLegacyUiHint?: boolean } {
	if (!body) return {};
	const match = body.match(/\n(\[Showing lines [^\n]+\])\s*$/);
	if (!match) return { body };
	return {
		body: body.slice(0, match.index).trimEnd() || undefined,
		hasLegacyUiHint: true,
	};
}

function parseHarnessValue(rawValue: string): string | number | boolean {
	if (/^-?\d+$/.test(rawValue)) return Number(rawValue);
	if (/^(true|false)$/i.test(rawValue)) return rawValue.toLowerCase() === "true";
	return rawValue;
}

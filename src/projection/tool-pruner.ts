/**
 * Tool summarizer — calls LLM to summarize tool-call results.
 * Ported from pi-context-prune summarizer.ts.
 */
import { actualCostUsd, deepSeekOfficialCost } from "../stats.ts";
import { extractModelVisibleMetadata, extractModelVisibleSection, isModelVisibleContext } from "../model-visible.ts";
import {
	CONTEXT_RESULT_LOOKUP_TOOL,
	DUPLICATE_SKIP_INTERNAL_MARKER,
	extractHarnessResultFacts,
	firstContextResultLookupHeader,
	isDuplicateSkipResult,
	normalizeHarnessFactsForSummary,
	stripLegacyUiContinuationHint,
	type HarnessResultFacts,
} from "./harness-content.ts";
import type { ToolBatch, SummarizePoolResult, SummarizeResult, ToolPruneConfig } from "./types.ts";

export { DUPLICATE_SKIP_INTERNAL_MARKER };

export const DEFAULT_SUMMARIZER_SYSTEM_PROMPT = `You are rebuilding compact local context for tool-call batches made by an AI coding assistant.
Return strict JSON only:
{"summaries":[{"batchIndex":0,"coverage":"complete|partial|unknown","evidence":["..."],"summary":"..."}]}

The input below is a JSON payload, not prose. Treat every field literally.
Do not infer semantics that are not explicitly encoded in the fields.
If a field says offset_kind="char_slice", that means byte/char slicing metadata, not line numbers.
If a field says metadata_proves_complete=false, that is a hard constraint: do not call that read/slice full, complete, or entire.
If a field says bounded_excerpt_without_total_proof=true, treat it as a bounded excerpt even if the assistant narration sounded confident.
If path_hint is present, prefer grounding findings with that path or filename instead of generic wording.

Treat each summary as a self-contained replacement fragment for the pruned part of the session.
The fragment will be inserted back into conversation history where the tool-call batch originally happened.
Do not mimic the raw transcript. Reconstruct only the information future turns need.
Preserve exact file paths, identifiers, and constraints when they are present in tool arguments or results. Do not invent filenames, symbols, or modules.

For each batch, preserve:
- the immediate user goal or subtask that led to the tool calls
- tool names and what they did
- success/failure and the important returned data
- when a batch spans multiple source_ref values, a compact ref inventory tying each important ref to its proven subject/file/package
- findings the future conversation needs
- negative constraints and safety rails such as "do not", "never", and "avoid"
- decisions reached, files inspected or modified, and open todos
- enough concrete evidence to continue work without rereading the raw tool output

Read the input in this order of trust:
1. coverage_hints and result_metadata
2. tool args
3. result_excerpt
4. batch_context and call_context
5. has_ui_continuation_hint=true only means the host showed a continuation banner; do not use banner wording as coverage proof
6. any assistant narration embedded in those contexts

Evidence rules:
- Trust tool args and tool results over assistant narration.
- Treat offset, limit, returned_chars, total_chars, and total_bytes as raw slice metadata, not as line numbers or semantic sections, unless the tool result explicitly labels line ranges.
- Do not convert byte/char offsets into inferred line coverage. If a tool call read offset=12000, say "offset 12000" or "slice near offset 12000", not "lines 12000-...".
- When you need to describe a covered interval, prefer "chars X-Y" or "offset X, returned Y chars" over ambiguous shorthand.
- For read/context_result_lookup batches in this environment, offset and limit refer to character slices of stored output, not file line numbers. Never restate them as "lines X-Y" unless the tool result itself labels those exact lines.
- If a file was generated with numbered lines, that still does not let you map character offsets to line numbers unless the fetched result explicitly shows the relevant line boundaries.
- If assistant narration claims "all", "every", "complete", or "without shortcuts", only preserve that as fact when the tool calls/results prove contiguous coverage.
- If offsets, ranges, refs, or file chunks have gaps, state the exact observed ranges and mark the work as partial.
 - If any requested or implied tail chunk was not fetched, or any middle range was skipped, coverage cannot be complete.
 - Never turn an assistant plan or self-report into a completed fact unless a matching tool result confirms it.
 - If any tool_call has evidence_strength="weak", keep completion claims conservative for that call.
 - evidence_claim_strength="weak", bounded_excerpt_without_total_proof=true, has_unfetched_tail=true, and has_gap=true are blockers for complete summaries.
 - For plain read/context_result_lookup calls with explicit offset/limit and no metadata_proves_complete, treat evidence as bounded until full interval proof appears.
 - Use Result metadata lines as machine evidence for ref, offset, limit, returned chars, total chars, and has_more.
- When several lookup slices cover different source_ref values, preserve a compact mapping such as "dsc-read-2 -> pi-context-engine README head" when that mapping is proven by args/result_excerpt. Avoid generic phrases like "many files" when the refs can be grounded more concretely.
- When source_ref values are absent or noisy but path_hint values are available, preserve a compact file inventory such as "cache-engine/index.ts -> bounded excerpt" or "pi-context-prune/README.md -> full read".
- If carry_forward_inventory is present, use it to understand which refs were already shown in earlier summarize requests. Do not assume the current request contains the first slice for those refs.
- If multiple tool calls share the same source_ref, later calls may contain only the novel suffix after earlier fetched content. Treat "[continues ...]" markers as host-provided deduplication, not as missing evidence.
- has_ui_continuation_hint=true means display chrome existed in the host UI. The banner wording is not part of the authoritative result and cannot prove line coverage.
- In legacy lookup metadata, treat returned_chars as slice length and total_bytes as the stored result size. If offset + returned_chars is still below total_bytes, coverage is partial or inconsistent, not complete.
- The same rule applies to individual file reads inside the batch: do not describe a read as "complete", "full", or "entire file" unless its metadata proves offset + returned_chars >= total_chars or total_bytes.
- For plain read tool calls with explicit limit or offset arguments but no total-size proof, treat them as bounded excerpts, not as full-file reads.
- If some files in a batch are proven complete and others are bounded excerpts, separate them explicitly. Do not group them under one sentence like "full source reads completed for X, Y, Z" unless every listed file is proven complete.
- For file/chunk work, coverage is complete only when observed result metadata or tool output proves the requested start and end were covered without unverified gaps.
- If a later lookup call returns zero chars for a non-zero offset while the earlier metadata still shows remaining total size, describe that as an incomplete or inconsistent tail fetch, not as proof of full capture.
- If a later assistant message says it skipped intermediate chunks, the summary must explicitly say coverage is partial, even if final chunks were checked.
- When coverage is partial or unknown, avoid wording such as "fully verified", "all data verified", or "complete capture"; scope claims narrowly to the tested slices only.
- If the summary mentions skipped, missing, unread, unfetched, incomplete, or gap ranges anywhere, the first line must be "Coverage: partial".
- Never rewrite char offsets as "first N lines", "lines X-Y", or "returned N lines" unless line_mapping_proven=true.
- If line_mapping_proven=false, do not write "line 15000", "lines 637-1272", "tail lines", or similar coverage claims even when the file content itself contains numbered labels like LINE_00637.
- When evidence is slice-based, cite the slice metadata directly in evidence bullets.
- When a batch contains 3 or more distinct source_ref values, ground substantive claims with an explicit compact ref/file inventory instead of generic wording like "several files" or "earlier slices".

When multiple batches in the same request revisit the same topic:
- treat higher batchIndex values as newer evidence
- if later evidence corrects, narrows, or disproves earlier findings, mark the earlier finding as provisional or superseded
- do not preserve disproved counts, filenames, symbols, or conclusions as active facts
- prefer durable settled conclusions over investigative dead ends

Skip turn-by-turn play-by-play. Do not emit tool calls, function-call markup, DSML, markdown headings, or SEARCH/REPLACE blocks.
Write each summary as a short continuation fragment:
- start with "Coverage: complete|partial|unknown"
- one line of local objective/context
- 1-3 short bullet points for the key tool findings
- one line for unresolved risk or next step, only if needed`;

const MAX_SUMMARY_RESULT_CHARS = 1200;
const MAX_ARGS_CHARS = 320;

interface StructuredToolCallPayload {
	evidence_strength: "weak" | "strong";
	evidence_flags: string[];
	evidence_metadata?: Record<string, unknown>;
	id: string;
	tool_name: string;
	turn_index?: number;
	args_text?: string;
	args_json?: unknown;
	call_context?: string;
	result_metadata?: Record<string, unknown>;
	result_excerpt?: string;
	has_ui_continuation_hint?: boolean;
	context_kind: "lookup-slice" | "read-slice" | "tool-result";
	offset_kind: "char_slice" | "unknown" | "n/a";
	coverage_hints: string[];
	source_ref?: string;
	path_hint?: string;
	has_unfetched_tail: boolean;
	has_gap: boolean;
	has_more: boolean;
	metadata_proves_complete: boolean;
	bounded_excerpt_without_total_proof: boolean;
	line_mapping_proven: boolean;
}

interface StructuredBatchPayload {
	batch_index: number;
	turn_index: number;
	batch_context?: string;
	evidence_strength: "weak" | "strong";
	evidence_flags: string[];
	coverage_hints: string[];
	tool_calls: StructuredToolCallPayload[];
}

interface CarryForwardRefInventoryItem {
	source_ref: string;
	seen_in_prior_request: true;
	observed_offsets: number[];
	total_chars?: number;
	total_bytes?: number;
	subject_hint?: string;
}

const QUALITY_RETRY_ADDENDUM = `

Quality correction for this retry:
- The previous summary was too generic or insufficiently grounded.
- Rewrite with explicit ref/file inventory when the batch contains multiple refs or file paths.
- If path_hint exists, mention concrete file paths or file-name suffixes instead of vague phrases like "several files".
- Do not describe any bounded excerpt as full/complete unless metadata_proves_complete=true for that exact file/slice.
- Keep the summary compact, but make the grounding auditable.`;

function compactLongBody(body: string, budget: number): string {
	const lines = body.split(/\r?\n/);
	if (lines.length >= 8) {
		const head = lines.slice(0, 4).join("\n");
		const tail = lines.slice(-4).join("\n");
		const omitted = Math.max(0, lines.length - 8);
		const marker = omitted > 0 ? `\n[... ${omitted} lines omitted ...]\n` : "\n";
		const combined = `${head}${marker}${tail}`.trim();
		if (combined.length <= budget) return combined;
	}
	if (body.length <= budget) return body;
	const headBudget = Math.max(120, Math.floor((budget - 32) * 0.6));
	const tailBudget = Math.max(80, budget - headBudget - 32);
	return `${body.slice(0, headBudget).trimEnd()}\n[... truncated ...]\n${body.slice(-tailBudget).trimStart()}`.trim();
}

function compactNormalizedResult(text: string): string {
	if (text.length <= MAX_SUMMARY_RESULT_CHARS) return text;
	return compactLongBody(text, MAX_SUMMARY_RESULT_CHARS);
}

function longestOverlapSuffixPrefix(left: string, right: string): number {
	const max = Math.min(left.length, right.length);
	for (let size = max; size >= 4; size--) {
		if (left.slice(-size) === right.slice(0, size)) return size;
	}
	return 0;
}

function trimRepeatedLookupContent(current: string, previous: string, ref: string): { display: string; merged: string } {
	const overlap = longestOverlapSuffixPrefix(previous, current);
	if (overlap > 0) {
		const novel = current.slice(overlap).trimStart();
		if (!novel) return { display: `[same ${ref} slice content as earlier lookup in this prune request]`, merged: previous };
		return {
			display: `[continues ${ref} after ${overlap} overlapping chars already seen earlier]\n${novel}`,
			merged: `${previous}\n${novel}`.trim(),
		};
	}
	if (current === previous) return { display: `[same ${ref} slice content as earlier lookup in this prune request]`, merged: previous };
	if (current.startsWith(previous)) {
		const novel = current.slice(previous.length).trimStart();
		return novel
			? { display: `[continues ${ref} after earlier lookup content]\n${novel}`, merged: `${previous}\n${novel}`.trim() }
			: { display: `[same ${ref} slice content as earlier lookup in this prune request]`, merged: previous };
	}
	return { display: current, merged: `${previous}\n${current}`.trim() };
}

function compactArgsForSummary(toolName: string, args: string): string {
	const trimmed = args.trim();
	if (!trimmed) return trimmed;
	if (!/^(bash|sh|zsh)$/i.test(toolName)) return trimmed.slice(0, 500);
	if (trimmed.length <= MAX_ARGS_CHARS) return trimmed;
	const target = trimmed.match(/(?:cat|tee)\s*>\s*([^\s]+)|(?:>|>>)\s*([^\s]+)/)?.slice(1).find(Boolean);
	const sources = Array.from(trimmed.matchAll(/\/home\/chez\/projects\/pi-extensions\/pi-context-engine\/[^\s"'`]+/g)).map((match) => match[0]);
	const uniqueSources = Array.from(new Set(sources)).slice(0, 4);
	const firstLine = trimmed.split("\n", 1)[0].slice(0, 140);
	const notes = [
		firstLine,
		target ? `target=${target}` : "",
		uniqueSources.length > 0 ? `paths=${uniqueSources.join(",")}` : "",
	].filter(Boolean);
	return `${notes.join(" | ")} | [bash args compacted from ${trimmed.length} chars]`;
}

function annotateSummaryArgs(toolName: string, args: string): string {
	const compacted = compactArgsForSummary(toolName, args);
	if (!compacted) return compacted;
	if (/^(read|context_result_lookup)$/i.test(toolName) && /"offset"\s*:|"limit"\s*:/i.test(compacted)) {
		return `${compacted} [note: offset/limit are character-slice parameters, not line numbers]`;
	}
	return compacted;
}

function tryParseArgs(args: string | undefined): unknown {
	if (!args) return undefined;
	try {
		return JSON.parse(args);
	} catch {
		return undefined;
	}
}

function extractNormalizedResultMetadata(text: string): { metadata?: Record<string, unknown>; body?: string } {
	const normalized = normalizeToolResultForSummary(text).trim();
	if (!normalized.startsWith("Result metadata: ")) return { body: normalized || undefined };
	const newline = normalized.indexOf("\n");
	const header = newline >= 0 ? normalized.slice(0, newline).trim() : normalized.trim();
	const body = newline >= 0 ? normalized.slice(newline + 1).trim() : "";
	const metadataText = header.replace(/^Result metadata:\s*/, "");
	const metadata: Record<string, unknown> = {};
	for (const token of metadataText.split(/\s+/)) {
		const [key, rawValue] = token.split("=");
		if (!key || rawValue == null) continue;
		if (/^-?\d+$/.test(rawValue)) metadata[key] = Number(rawValue);
		else if (/^(true|false)$/i.test(rawValue)) metadata[key] = rawValue.toLowerCase() === "true";
		else metadata[key] = rawValue;
	}
	return {
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		body: body || undefined,
	};
}

function extractEvidenceMetadataFromResult(text: string): Record<string, unknown> | undefined {
	const normalized = normalizeToolResultForSummary(text).trim();
	const prefix = /^Evidence metadata:\s*(\{.*\})/i.exec(normalized);
	if (!prefix) return undefined;
	try {
		const parsed = JSON.parse(prefix[1]);
		return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

function neutralizeSliceContent(body: string | undefined): string | undefined {
	if (!body) return body;
	let next = body;
	const lineLabelMatches = next.match(/^LINE_\d+\s*\|/gm)?.length ?? 0;
	if (lineLabelMatches >= 3) next = next.replace(/^LINE_\d+\s*\|/gm, "LINE_LABEL |");
	const numericOnlyMatches = next.match(/^\d+$/gm)?.length ?? 0;
	if (numericOnlyMatches >= 3) next = next.replace(/^\d+$/gm, "<numbered content>");
	return next;
}

function buildCoverageHints(toolName: string, args: string | undefined, result: string | undefined, facts?: HarnessResultFacts): string[] {
	const hints = new Set<string>();
	const source = `${toolName}\n${args ?? ""}\n${result ?? ""}`;
	if (toolName === CONTEXT_RESULT_LOOKUP_TOOL || facts?.ref) hints.add("lookup_slice");
	if (/^read$/i.test(toolName) && /"offset"\s*:\s*\d+/i.test(args ?? "")) hints.add("read_slice");
	if (/"offset"\s*:\s*[1-9]\d*/i.test(args ?? "")) hints.add("nonzero_offset");
	if (/"limit"\s*:\s*\d+/i.test(args ?? "")) hints.add("explicit_limit");
	if (facts?.hasMore === true) hints.add("has_more_true");
	if (facts?.returnedChars !== undefined || facts?.totalChars !== undefined || facts?.totalBytes !== undefined) hints.add("slice_metadata_present");
	if (/returned 0/i.test(source)) hints.add("zero_return");
	if (/truncated|partial output/i.test(source)) hints.add("truncated_or_partial");
	if (/full list not captured|never fetched|output was truncated|skipped intermediate|without shortcuts/i.test(source)) hints.add("narration_mentions_incomplete_or_claims");
	if (facts?.continuation === "has-more") hints.add("continuation_hint");
	return Array.from(hints);
}

function inferEvidenceStrengthFromCall(
	toolName: string,
	args: string | undefined,
	metadata: Record<string, unknown> | undefined,
	evidenceMetadata: Record<string, unknown> | undefined,
	hints: string[],
	hasMore: boolean,
): "weak" | "strong" {
	const explicitLimit = /"limit"\s*:\s*\d+/i.test(args ?? "");
	const explicitOffset = /"offset"\s*:\s*[1-9]\d*/i.test(args ?? "");
	const boundedRead = /^read$/i.test(toolName) && (explicitOffset || explicitLimit) && !(metadataShowsFullSlice(metadata));
	const claimStrength = typeof evidenceMetadata?.claim_strength === "string" ? evidenceMetadata.claim_strength.toLowerCase() : undefined;
	const hasWeakMarker = claimStrength === "weak" || hints.includes("has_more_true") || hints.includes("continuation_hint") || hints.includes("truncated_or_partial");
	const hasGapMarker = hints.includes("nonzero_offset") || hints.includes("narration_mentions_incomplete_or_claims");
	const boundedWithoutProof = (hints.includes("bounded_excerpt_without_total_proof") || hints.includes("has_unfetched_tail") || hints.includes("has_gap")) && !metadataShowsFullSlice(metadata);
	if (boundedRead || boundedWithoutProof || hasWeakMarker || hasGapMarker || hasMore) return "weak";
	return "strong";
}

function metadataShowsFullSlice(metadata: Record<string, unknown> | undefined): boolean {
	if (!metadata) return false;
	const offset = typeof metadata.offset === "number" ? metadata.offset : 0;
	const returned = typeof metadata.returned_chars === "number" ? metadata.returned_chars : undefined;
	const totalChars = typeof metadata.total_chars === "number" ? metadata.total_chars : undefined;
	const totalBytes = typeof metadata.total_bytes === "number" ? metadata.total_bytes : undefined;
	if (returned == null) return false;
	if (typeof totalChars === "number" && offset + returned >= totalChars) return true;
	if (typeof totalBytes === "number" && offset + returned >= totalBytes) return true;
	return false;
}

function buildStructuredToolCallPayload(toolCall: ToolBatch["toolCalls"][number], includeContext = true): StructuredToolCallPayload {
	const argsJson = tryParseArgs(toolCall.args);
	const normalized = toolCall.result ? normalizeToolResultForSummary(toolCall.result) : "";
	const { metadata, body } = normalized ? extractNormalizedResultMetadata(normalized) : {};
	const facts = extractHarnessResultFacts(toolCall.result);
	const { body: bodyWithoutUiHint, hasLegacyUiHint } = stripLegacyUiContinuationHint(body);
	const toolName = String(toolCall.name ?? "unknown");
	const coverageHints = buildCoverageHints(toolName, toolCall.args, toolCall.result, facts);
	const evidenceMetadata = extractEvidenceMetadataFromResult(toolCall.result ?? "");
	const sourceRef = typeof metadata?.ref === "string"
		? metadata.ref
		: facts?.ref
			? facts.ref
		: typeof (argsJson as any)?.ref === "string"
			? (argsJson as any).ref
			: undefined;
	const pathHint = typeof (argsJson as any)?.path === "string"
		? (argsJson as any).path
		: undefined;
	const isLookupSlice = coverageHints.includes("lookup_slice");
	const isReadSlice = coverageHints.includes("read_slice");
	const normalizedBody = isLookupSlice || isReadSlice ? neutralizeSliceContent(bodyWithoutUiHint) : bodyWithoutUiHint;
	const hasMore = metadata?.has_more === true;
	const metadataComplete = metadataShowsFullSlice(metadata);
	const boundedExcerptWithoutTotalProof = /^read$/i.test(toolName)
		&& (coverageHints.includes("explicit_limit") || coverageHints.includes("nonzero_offset"))
		&& !metadataComplete;
	const hasUnfetchedTail = !metadataComplete && (hasMore
		|| coverageHints.includes("continuation_hint")
		|| coverageHints.includes("zero_return")
		|| coverageHints.includes("truncated_or_partial"));
	const hasGap = coverageHints.includes("nonzero_offset")
		|| coverageHints.includes("narration_mentions_incomplete_or_claims");
	const evidenceFlags = [
		...coverageHints,
		...(boundedExcerptWithoutTotalProof ? ["bounded_excerpt_without_total_proof"] : []),
		...(hasUnfetchedTail ? ["has_unfetched_tail"] : []),
		...(hasGap ? ["has_gap"] : []),
		...(facts?.hasMore === true ? ["has_more_true"] : []),
	];
	if (typeof evidenceMetadata?.claim_strength === "string") {
		evidenceFlags.push(`evidence_claim_strength_${evidenceMetadata.claim_strength.toString().toLowerCase()}`);
	}
	const evidenceStrength = inferEvidenceStrengthFromCall(
		toolName,
		toolCall.args,
		metadata,
		evidenceMetadata,
		evidenceFlags,
		hasMore,
	);
	return {
		id: String(toolCall.id ?? toolName),
		tool_name: toolName,
		turn_index: typeof toolCall.turnIndex === "number" ? toolCall.turnIndex : undefined,
		args_text: toolCall.args ? annotateSummaryArgs(toolName, toolCall.args) : undefined,
		args_json: argsJson,
		call_context: includeContext ? toolCall.context?.slice(0, 600) : undefined,
		result_metadata: metadata,
		result_excerpt: normalizedBody ? compactNormalizedResult(normalizedBody) : undefined,
		evidence_metadata: evidenceMetadata,
		evidence_strength: evidenceStrength,
		evidence_flags: evidenceFlags,
		has_ui_continuation_hint: hasLegacyUiHint,
		context_kind: isLookupSlice ? "lookup-slice" : isReadSlice ? "read-slice" : "tool-result",
		offset_kind: isLookupSlice || isReadSlice ? "char_slice" : metadata?.offset != null ? "unknown" : "n/a",
		coverage_hints: coverageHints,
		source_ref: sourceRef,
		path_hint: pathHint,
		has_unfetched_tail: hasUnfetchedTail,
		has_gap: hasGap,
		has_more: hasMore,
		metadata_proves_complete: metadataComplete,
		bounded_excerpt_without_total_proof: boundedExcerptWithoutTotalProof,
		line_mapping_proven: false,
	};
}

function buildStructuredBatchPayload(batch: ToolBatch, batchIndex: number, includeContext = true): StructuredBatchPayload {
	const toolCalls = batch.toolCalls.map((toolCall) => buildStructuredToolCallPayload(toolCall, includeContext));
	const coverageHints = new Set<string>();
	let batchEvidenceStrength: StructuredToolCallPayload["evidence_strength"] = "strong";
	const batchEvidenceFlags = new Set<string>();
	for (const toolCall of toolCalls) {
		for (const hint of toolCall.coverage_hints) coverageHints.add(hint);
		if (toolCall.has_unfetched_tail) coverageHints.add("has_unfetched_tail");
		if (toolCall.has_gap) coverageHints.add("has_gap");
		if (toolCall.evidence_strength === "weak") batchEvidenceStrength = "weak";
		for (const flag of toolCall.evidence_flags ?? []) batchEvidenceFlags.add(flag);
	}
	return {
		batch_index: batchIndex,
		turn_index: batch.turnIndex,
		batch_context: includeContext ? batch.context?.slice(0, 1200) : undefined,
		evidence_strength: batchEvidenceStrength,
		evidence_flags: Array.from(batchEvidenceFlags),
		coverage_hints: Array.from(coverageHints),
		tool_calls: toolCalls,
	};
}

/**
 * Serialize a batch of tool calls for the summarizer.
 */
function serializeBatch(batch: ToolBatch, batchIndex: number, includeContext = true): string {
	const seenResults = new Map<string, string>();
	const seenLookupRefs = new Map<string, string>();
	const payload = buildStructuredBatchPayload(batch, batchIndex, includeContext);
	payload.tool_calls = payload.tool_calls.map((toolCall, index) => {
		let excerpt = toolCall.result_excerpt?.trim();
		if (!excerpt) return { ...toolCall, result_excerpt: undefined };
		if (toolCall.context_kind === "lookup-slice" && toolCall.source_ref) {
			const previous = seenLookupRefs.get(toolCall.source_ref);
			if (previous) {
				const next = trimRepeatedLookupContent(excerpt, previous, toolCall.source_ref);
				excerpt = next.display;
				seenLookupRefs.set(toolCall.source_ref, next.merged);
			} else {
				seenLookupRefs.set(toolCall.source_ref, excerpt);
			}
		}
		const dedupeKey = `${toolCall.tool_name}\n${excerpt}`;
		const firstSeenTool = seenResults.get(dedupeKey);
		if (firstSeenTool) return { ...toolCall, result_excerpt: `[same result as earlier ${firstSeenTool} output in this prune request]` };
		seenResults.set(dedupeKey, toolCall.tool_name);
		const compacted = compactNormalizedResult(excerpt);
		return compacted ? { ...toolCall, result_excerpt: compacted } : { ...toolCall, result_excerpt: undefined };
	});
	return JSON.stringify(payload, null, 2);
}

function stripLookupHeader(text: string): string {
	const newline = text.indexOf("\n");
	return newline >= 0 ? text.slice(newline + 1).trimStart() : text.trim();
}

function normalizeLookupMetadata(header: string): string {
	const facts = extractHarnessResultFacts(header);
	return normalizeHarnessFactsForSummary(facts)
		?? header
			.replace(/^\[context_result_lookup\s*/, "")
			.replace(/\]$/, "")
			.replace(/\breturned=/g, "returned_chars=")
			.replace(/\bbytes=/g, "total_bytes=")
			.trim();
}

export function normalizeToolResultForSummary(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	if (isDuplicateSkipResult(trimmed)) return "";
	if (!isModelVisibleContext(trimmed)) {
		const header = firstContextResultLookupHeader(trimmed);
		const body = stripLookupHeader(trimmed);
		if (!header) return trimmed;
		const normalizedHeader = normalizeLookupMetadata(header);
		const bodyLooksLikeSameHeader = body === trimmed || body.trim() === header.trim();
		return body && !bodyLooksLikeSameHeader ? `Result metadata: ${normalizedHeader}\n${body}` : `Result metadata: ${normalizedHeader}`;
	}
	const lookup = extractModelVisibleSection(trimmed, "slice_metadata") ?? extractModelVisibleSection(trimmed, "lookup");
	const metadata = lookup ? firstContextResultLookupHeader(lookup) : undefined;
	if (lookup) {
		const normalizedLookup = stripLookupHeader(lookup).trim();
		if (normalizedLookup && !normalizedLookup.startsWith("[context_result_lookup ")) {
			return metadata ? `Result metadata: ${normalizeLookupMetadata(metadata)}\n${normalizedLookup}` : normalizedLookup;
		}
	}
	const preview = extractModelVisibleSection(trimmed, "preview");
	if (preview) {
		const result = preview.trim();
		return metadata ? `Result metadata: ${normalizeLookupMetadata(metadata)}\n${result}` : result;
	}
	const output = extractModelVisibleSection(trimmed, "output");
	if (output) {
		return `Evidence metadata: ${JSON.stringify(extractModelVisibleMetadata(trimmed) ?? {})}\n${output.trim()}`;
	}
	return stripLookupHeader(trimmed);
}

export function estimateBatchReplacementChars(batch: ToolBatch): number {
	let total = batch.context?.length ?? 0;
	for (const tc of batch.toolCalls) {
		total += tc.name.length;
		total += tc.context?.length ?? 0;
		total += tc.args?.length ?? 0;
		total += tc.result?.length ?? 0;
	}
	return total;
}

export function isReplacementSummaryEfficient(batch: ToolBatch, summaryText: string): boolean {
	const replacementChars = estimateBatchReplacementChars(batch);
	if (replacementChars <= 0) return false;
	return summaryText.trim().length <= replacementChars;
}

export function buildObservationMaskSummary(batch: ToolBatch, reason = "summary unavailable"): string {
	const lines = [
		"Coverage: unknown",
		`Tool output masked without LLM summary (${reason}).`,
	];
	for (const toolCall of batch.toolCalls.slice(0, 8)) {
		const args = tryParseArgs(toolCall.args) as any;
		const facts = extractHarnessResultFacts(toolCall.result);
		const parts = [`Tool: ${toolCall.name}`];
		if (typeof args?.path === "string") parts.push(`path=${args.path}`);
		if (typeof args?.ref === "string") parts.push(`arg_ref=${args.ref}`);
		if (facts?.ref) parts.push(`ref=${facts.ref}`);
		const offset = facts?.offset ?? (typeof args?.offset === "number" ? args.offset : undefined);
		const limit = facts?.limit ?? (typeof args?.limit === "number" ? args.limit : undefined);
		if (offset !== undefined) parts.push(`offset=${offset}`);
		if (limit !== undefined) parts.push(`limit=${limit}`);
		if (facts?.returnedChars !== undefined) parts.push(`returned_chars=${facts.returnedChars}`);
		if (facts?.totalChars !== undefined) parts.push(`total_chars=${facts.totalChars}`);
		if (facts?.totalBytes !== undefined) parts.push(`total_bytes=${facts.totalBytes}`);
		if (facts?.hasMore !== undefined) parts.push(`has_more=${facts.hasMore ? "true" : "false"}`);
		lines.push(`- ${parts.join(", ")}.`);
	}
	if (batch.toolCalls.length > 8) lines.push(`- ${batch.toolCalls.length - 8} additional tool calls masked.`);
	lines.push("Raw output omitted; content facts are not verified from masked output.");
	return lines.join("\n");
}

function observationMaskResults(batches: ToolBatch[], reason: string): SummarizeResult[] {
	return batches.map((batch) => ({ summaryText: buildObservationMaskSummary(batch, reason) }));
}

function summaryTokenBudgetForBatches(batches: ToolBatch[]): number {
	const rawChars = batches.reduce((sum, batch) => sum + estimateBatchReplacementChars(batch), 0);
	const toolCalls = batches.reduce((sum, batch) => sum + batch.toolCalls.length, 0);
	const rawTokens = Math.max(1, Math.ceil(rawChars / 4));
	const perBatchFloor = 160 * Math.max(1, batches.length);
	const compressionTarget = Math.ceil(rawTokens * 0.18);
	const oversized = rawChars >= 120_000 || toolCalls >= 80 || batches.length >= 4;
	const ceiling = oversized ? 2048 : 1024;
	return Math.max(192, Math.min(ceiling, Math.max(perBatchFloor, compressionTarget)));
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function extractJson(text: string): any | undefined {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const raw = fenced?.[1]?.trim() ?? trimmed;
	try {
		return JSON.parse(raw);
	} catch {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(raw.slice(start, end + 1));
			} catch {
				return undefined;
			}
		}
		return undefined;
	}
}

function decodeJsonishString(text: string): string {
	return text
		.replace(/\\n/g, "\n")
		.replace(/\\"/g, "\"")
		.replace(/\\\\/g, "\\")
		.trim();
}

function extractMalformedSingleSummary(text: string): any | undefined {
	const coverage = text.match(/"coverage"\s*:\s*"([^"]+)"/)?.[1]?.trim();
	const summaryStart = text.indexOf("\"summary\":\"");
	if (!coverage && summaryStart < 0) return undefined;
	let summary = "";
	if (summaryStart >= 0) {
		const raw = text.slice(summaryStart + "\"summary\":\"".length);
		const closed = raw.search(/"\s*}\s*]?\s*}?/);
		summary = decodeJsonishString(closed >= 0 ? raw.slice(0, closed) : raw);
	}
	const evidence = Array.from(text.matchAll(/"evidence"\s*:\s*\[([\s\S]*?)\]/g))
		.flatMap((match) => Array.from(match[1].matchAll(/"((?:\\.|[^"])*)"/g)).map((item) => decodeJsonishString(item[1])))
		.filter(Boolean);
	if (!coverage && !summary) return undefined;
	return { batchIndex: 0, coverage, summary, evidence };
}

function looksLikeStructuredJsonAttempt(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.startsWith("{")
		|| trimmed.startsWith("[")
		|| /^```(?:json)?\s*[{[]/i.test(trimmed);
}

function contentText(content: any): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part: any) => {
				if (typeof part === "string") return part;
				if (part?.type === "text" && typeof part.text === "string") return part.text;
				if (typeof part?.text === "string") return part.text;
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

function readUsage(response: any, prompt: string, text: string): { input: number; output: number; cacheRead?: number } {
	const usage = response?.usage;
	const rawInput = usage?.input ?? usage?.inputTokens ?? usage?.input_tokens ?? usage?.promptTokens ?? usage?.prompt_tokens;
	const rawOutput = usage?.output ?? usage?.outputTokens ?? usage?.output_tokens ?? usage?.completionTokens ?? usage?.completion_tokens;
	const rawCacheRead = usage?.cacheRead ?? usage?.cache_read ?? usage?.cacheReadTokens ?? usage?.cache_read_input_tokens;
	const input = typeof rawInput === "number" && rawInput > 0 ? rawInput : estimateTokens(prompt);
	const output = typeof rawOutput === "number" && rawOutput > 0 ? rawOutput : estimateTokens(text);
	const cacheRead = typeof rawCacheRead === "number" && rawCacheRead > 0 ? rawCacheRead : 0;
	return { input, output, cacheRead };
}

function resolveModel(config: ToolPruneConfig): string | undefined {
	return config.summarizerModel === "auto" || config.summarizerModel === "default" ? undefined : (config.summarizerModel || undefined);
}

function emptyDebug(prompt: string, maxTokens: number, responseText = ""): SummarizePoolResult["debug"] {
	return { prompt, responseText, maxTokens, acceptedSummaries: [] };
}

function maskDebug(prompt: string, maxTokens: number, summaries: SummarizeResult[], responseText = ""): NonNullable<SummarizePoolResult["debug"]> {
	return { prompt, responseText, maxTokens, acceptedSummaries: summaries.map((item) => item.summaryText) };
}

async function resolvePiAiModel(modelId: string | undefined, ctx: any): Promise<any | undefined> {
	if (!modelId) return ctx?.model;
	if (ctx?.model?.id === modelId || `${ctx?.model?.provider}/${ctx?.model?.id}` === modelId) return ctx.model;
	const slash = modelId.indexOf("/");
	if (slash > 0) {
		const provider = modelId.slice(0, slash);
		const id = modelId.slice(slash + 1);
		const spec = "@earendil-works/pi-ai";
		const mod = await import(spec);
		return mod.getModel?.(provider, id);
	}
	if (!ctx?.model?.provider) return undefined;
	const spec = "@earendil-works/pi-ai";
	return (await import(spec)).getModel?.(ctx.model.provider, modelId);
}

function responseContentText(response: any): string {
	if (typeof response === "string") return response;
	return contentText(response?.content)
		|| contentText(response?.message?.content)
		|| contentText(response?.choices?.[0]?.message?.content)
		|| contentText(response?.output)
		|| (typeof response?.output_text === "string" ? response.output_text : "")
		|| (typeof response?.text === "string" ? response.text : "");
}

async function completeWithPiAi(modelId: string | undefined, userMessage: string, opts?: { signal?: AbortSignal; ctx?: any; maxTokens?: number; reasoningEffort?: string }): Promise<any> {
	const ctx = opts?.ctx;
	const model = await resolvePiAiModel(modelId, ctx);
	if (!model) return { error: `summary model not found: ${modelId ?? "current"}`, errorKey: "engine.prune.error.summaryModelUnavailable" };
	const auth = await ctx?.modelRegistry?.getApiKeyAndHeaders?.(model);
	if (!auth?.ok) return { error: auth?.error ?? `no auth for summary model ${model.id ?? modelId ?? "current"}`, errorKey: "engine.prune.error.summaryAuth" };
	if (!auth.apiKey) return { error: `no API key for summary model ${model.provider ?? ""}/${model.id ?? modelId ?? "current"}`, errorKey: "engine.prune.error.summaryAuth" };
	const spec = "@earendil-works/pi-ai";
	const { complete } = await import(spec);
	const response = await complete(
		model,
		{ messages: [{ role: "user", content: [{ type: "text", text: userMessage }], timestamp: Date.now() }] },
		{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: opts?.maxTokens, signal: opts?.signal, reasoningEffort: opts?.reasoningEffort === "off" ? undefined : opts?.reasoningEffort },
	);
	return { response, modelId: `${model.provider ?? ""}/${model.id ?? modelId ?? "current"}`.replace(/^\//, "") };
}

export function buildPoolPrompt(
	batches: ToolBatch[],
	includeContext = true,
	systemPrompt = DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
	carryForwardInventory: CarryForwardRefInventoryItem[] = [],
): string {
	const payload = {
		payload_kind: "tool_call_batches_v2",
		offset_semantics: "char_slice",
		carry_forward_inventory: carryForwardInventory,
		batches: batches.map((batch, index) => JSON.parse(serializeBatch(batch, index, includeContext))),
	};
	return `${systemPrompt}\n\nInput JSON:\n${JSON.stringify(payload, null, 2)}`;
}

function summaryTextFromItem(item: any, batchEvidence?: BatchEvidenceState): string {
	if (typeof item === "string") return item.trim();
	const content = contentText(item?.summary ?? item?.summaryText ?? item?.text ?? item?.content ?? item?.markdown);
	const summary = content.trim();
	const coverage = typeof item?.coverage === "string" ? item.coverage.trim() : "";
	const evidence = Array.isArray(item?.evidence) ? item.evidence.map((value: any) => String(value).trim()).filter(Boolean) : [];
	const summaryCoverage = summary.match(/^Coverage:\s*(complete|partial|unknown)\b\s*/i)?.[1]?.toLowerCase();
	const summaryBody = summary.replace(/^Coverage:\s*(complete|partial|unknown)\b\s*/i, "").trim();
	if (!coverage && evidence.length === 0) return summary;
	const lines = [];
	if (coverage) lines.push(`Coverage: ${coverage}`);
	else if (summaryCoverage) lines.push(`Coverage: ${summaryCoverage}`);
	if (summaryBody) lines.push(summaryBody);
	for (const item of evidence.slice(0, 3)) lines.push(`- Evidence: ${item}`);
	return enforceEvidenceConservativeCoverage(repairCoverageConsistency(lines.join("\n").trim()), batchEvidence);
}

function repairCoverageConsistency(summary: string): string {
	if (!/^Coverage:\s*complete\b/im.test(summary)) return summary;
	if (!/\b(skipped|missing|unread|unfetched|incomplete|gap|not read|not fetched|partial verification|bounded excerpt|partially read|tail missing|offset=\d+|continuation available)\b/i.test(summary)) return summary;
	return summary.replace(/^Coverage:\s*complete\b/im, "Coverage: partial");
}

interface BatchEvidenceState {
	evidenceStrength: "weak" | "strong";
	evidenceFlags: string[];
}

function inferBatchEvidence(batch: ToolBatch): BatchEvidenceState {
	const toolCalls = batch.toolCalls.map((toolCall) => buildStructuredToolCallPayload(toolCall, false));
	const evidenceFlags = new Set<string>();
	let evidenceStrength: "weak" | "strong" = "strong";
	for (const toolCall of toolCalls) {
		if (toolCall.evidence_strength === "weak") evidenceStrength = "weak";
		for (const flag of toolCall.evidence_flags ?? []) evidenceFlags.add(flag);
	}
	return { evidenceStrength, evidenceFlags: Array.from(evidenceFlags) };
}

function enforceEvidenceConservativeCoverage(summary: string, batchEvidence?: BatchEvidenceState): string {
	if (!summary) return summary;
	if (batchEvidence?.evidenceStrength !== "weak") return summary;
	if (!/^Coverage:\s*complete\b/im.test(summary)) return summary;
	const downgraded = summary.replace(/^Coverage:\s*complete\b/i, "Coverage: partial");
	const warning = "Evidence coverage flags are weak or bounded; keep conclusions scoped.";
	return repairCoverageConsistency(downgraded.includes("Evidence:") ? downgraded : `${downgraded}\n- ${warning}`);
}

function needsQualityRetry(batch: ToolBatch, summary: string, batchEvidence?: BatchEvidenceState): boolean {
	const claimsComplete = /^Coverage:\s*complete\b/im.test(summary) || /\b(full|entire|all|complete)\b/i.test(summary);
	if (batchEvidence?.evidenceStrength === "weak" && claimsComplete) return true;
	if (!batchEvidence?.evidenceFlags.length) return hasWeakGrounding(batch, summary) || hasUnsupportedReadCompleteness(batch, summary);
	const evidenceRisk = batchEvidence.evidenceFlags.some((flag) => flag.includes("evidence_claim_strength_weak") || flag.includes("bounded_excerpt_without_total_proof") || flag.includes("has_unfetched_tail") || flag.includes("has_gap"));
	return evidenceRisk && claimsComplete || hasWeakGrounding(batch, summary) || hasUnsupportedReadCompleteness(batch, summary);
}

function batchSourceRefs(batch: ToolBatch): string[] {
	return Array.from(new Set(batch.toolCalls.flatMap((toolCall) => {
		const source = `${toolCall.args ?? ""}\n${toolCall.result ?? ""}`;
		return Array.from(source.matchAll(/dsc-[A-Za-z0-9-]+/g)).map((match) => match[0]);
	})));
}

function batchPathHints(batch: ToolBatch): string[] {
	return Array.from(new Set(batch.toolCalls.flatMap((toolCall) => {
		const path = (toolCall.args ?? "").match(/"path"\s*:\s*"([^"]+)"/)?.[1];
		if (!path) return [];
		const parts = path.split("/").filter(Boolean);
		return [path, parts.at(-1), parts.slice(-2).join("/")].filter(Boolean) as string[];
	})));
}

function hasWeakGrounding(batch: ToolBatch, summary: string): boolean {
	const refs = batchSourceRefs(batch);
	const refMentions = refs.filter((ref) => summary.includes(ref)).length;
	const pathHints = batchPathHints(batch);
	const pathMentions = pathHints.filter((hint) => summary.includes(hint)).length;
	return refs.length >= 3 && refMentions < Math.min(2, refs.length) && pathMentions < Math.min(2, pathHints.length || 0);
}

export function hasUnsupportedReadCompleteness(batch: ToolBatch, summary: string): boolean {
	const boundedHints = new Map<string, true>();
	for (const toolCall of batch.toolCalls) {
		if (!/^read$/i.test(String(toolCall.name ?? ""))) continue;
		const args = toolCall.args ?? "";
		const path = args.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
		if (!path) continue;
		const parts = path.split("/").filter(Boolean);
		const keys = [path, parts.at(-1), parts.slice(-2).join("/")].filter(Boolean) as string[];
		const bounded = /"limit"\s*:\s*\d+|"offset"\s*:\s*\d+/i.test(args);
		const normalized = toolCall.result ? normalizeToolResultForSummary(toolCall.result) : "";
		const { metadata } = normalized ? extractNormalizedResultMetadata(normalized) : {};
		if (!bounded || metadataShowsFullSlice(metadata)) continue;
		for (const key of keys) boundedHints.set(key, true);
	}
	if (boundedHints.size === 0) return false;
	for (const line of summary.split(/\r?\n/)) {
		if (!/\b(full|complete|fully read|entire)\b/i.test(line)) continue;
		if (/\b(not read|unread|remain unread|remaining|tail|partial|bounded excerpt|incomplete)\b/i.test(line)) continue;
		for (const key of boundedHints.keys()) {
			if (line.includes(key)) return true;
		}
	}
	return false;
}

function extractSummaryItems(parsed: any): any[] {
	if (Array.isArray(parsed)) return parsed;
	if (Array.isArray(parsed?.summaries)) return parsed.summaries;
	if (Array.isArray(parsed?.results)) return parsed.results;
	if (Array.isArray(parsed?.batches)) return parsed.batches;
	if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") return [parsed];
	return [];
}

/**
 * Call summarizer LLM via pi-ai.
 */
export async function summarizeToolBatch(
	pi: any,
	batch: ToolBatch,
	_config: ToolPruneConfig,
	opts?: { signal?: AbortSignal; ctx?: any; qualityRetry?: boolean },
): Promise<SummarizeResult | null> {
	const pool = await summarizeToolBatchPool(pi, [batch], _config, opts);
	return pool.results[0] ?? null;
}

/**
 * Summarize multiple batches with one model request. This keeps prune overhead
 * visible and prevents N small summarization requests from causing avoidable
 * prompt-cache churn.
 */
export async function summarizeToolBatchPool(
	pi: any,
	batches: ToolBatch[],
	config: ToolPruneConfig,
	opts?: { signal?: AbortSignal; ctx?: any; qualityRetry?: boolean },
): Promise<SummarizePoolResult> {
	const rawChars = batches.reduce((sum, batch) => sum + estimateBatchReplacementChars(batch), 0);
	const emptyMetrics = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, batches: batches.length, toolCalls: batches.reduce((sum, batch) => sum + batch.toolCalls.length, 0), rawChars, summaryChars: 0, modelId: resolveModel(config) };
	if (batches.length === 0) return { results: [], metrics: emptyMetrics };

	const includeContext = config.includeContext !== false;
	const userMessage = buildPoolPrompt(
		batches,
		includeContext,
		config.promptOverride ?? DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
		config.carryForwardInventory ?? [],
	);
	const maxTokens = summaryTokenBudgetForBatches(batches);
	const timeoutMs = 15_000;
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	const combinedSignal = opts?.signal
		? (AbortSignal.any?.([opts.signal, timeoutSignal]) ?? timeoutSignal)
		: timeoutSignal;

	try {
		const model = resolveModel(config);
		let response: any;
		let resolvedModelId = model;
		if (typeof pi?.complete === "function" && !opts?.ctx?.modelRegistry) {
			response = await pi.complete(model, [{ role: "user", content: userMessage }], { maxTokens, signal: combinedSignal, reasoningEffort: undefined });
		} else {
			const completed = await completeWithPiAi(model, userMessage, { ctx: opts?.ctx, signal: combinedSignal, maxTokens, reasoningEffort: "off" });
			if (completed.error) {
				const masked = observationMaskResults(batches, completed.error);
				return { results: masked, metrics: { ...emptyMetrics, errorKey: completed.errorKey ?? "engine.prune.error.summaryModelUnavailable", summaryChars: masked.reduce((sum, item) => sum + item.summaryText.length, 0) }, debug: emptyDebug(userMessage, maxTokens) };
			}
			response = completed.response;
			resolvedModelId = completed.modelId ?? model;
		}

		if (!response) {
			const error = "summary model returned no response";
			const masked = observationMaskResults(batches, error);
			return { results: masked, metrics: { ...emptyMetrics, requests: 1, inputTokens: estimateTokens(userMessage), summaryChars: masked.reduce((sum, item) => sum + item.summaryText.length, 0), errorKey: "engine.prune.error.modelNoResponse" }, debug: maskDebug(userMessage, maxTokens, masked) };
		}
		const text = responseContentText(response);
		if (!text || text.trim().length === 0) {
			const usage = readUsage(response, userMessage, text ?? "");
			const pricing = deepSeekOfficialCost(model);
			const cost = actualCostUsd({ input: usage.input, cacheRead: usage.cacheRead ?? 0, cacheWrite: 0, output: 0, cost: response?.usage?.cost?.total ?? response?.usage?.cost }, pricing);
			const error = "summary response was empty";
			const masked = observationMaskResults(batches, error);
			return {
				results: masked,
				metrics: { ...emptyMetrics, requests: 1, inputTokens: usage.input, outputTokens: 0, cacheReadTokens: usage.cacheRead ?? 0, cost, modelId: resolvedModelId, summaryChars: masked.reduce((sum, item) => sum + item.summaryText.length, 0), errorKey: "engine.prune.error.summaryEmpty" },
				debug: maskDebug(userMessage, maxTokens, masked, text ?? ""),
			};
		}

		const usage = readUsage(response, userMessage, text);
		const pricing = deepSeekOfficialCost(model);
		const cost = actualCostUsd({ input: usage.input, cacheRead: usage.cacheRead ?? 0, cacheWrite: 0, output: usage.output, cost: response?.usage?.cost?.total ?? response?.usage?.cost }, pricing);
		const parsed = extractJson(text);
		const malformedSingle = !parsed && batches.length === 1 ? extractMalformedSingleSummary(text) : undefined;
		const summaries = malformedSingle ? [malformedSingle] : extractSummaryItems(parsed);
		const batchEvidence = batches.map((batch) => inferBatchEvidence(batch));
		const results = batches.map((_, index) => {
			const item = summaries.find((summary: any) => Number(summary?.batchIndex ?? summary?.index) === index) ?? summaries[index];
			const summaryText = summaryTextFromItem(item, batchEvidence[index]) || (batches.length === 1 && !looksLikeStructuredJsonAttempt(text) ? text.trim() : "");
			return summaryText ? { summaryText, usage } : null;
		});
		const hasUsableSummaries = results.some(Boolean);
		if (!hasUsableSummaries && batches.length > 1) {
			const retried = await Promise.all(
				batches.map((batch) => summarizeToolBatchPool(pi, [batch], config, opts)),
			);
			return {
				results: retried.flatMap((item) => item.results),
				metrics: {
					requests: 1 + retried.reduce((sum, item) => sum + (item.metrics.requests ?? 0), 0),
					inputTokens: usage.input + retried.reduce((sum, item) => sum + (item.metrics.inputTokens ?? 0), 0),
					outputTokens: usage.output + retried.reduce((sum, item) => sum + (item.metrics.outputTokens ?? 0), 0),
					cacheReadTokens: (usage.cacheRead ?? 0) + retried.reduce((sum, item) => sum + (item.metrics.cacheReadTokens ?? 0), 0),
					cost: cost + retried.reduce((sum, item) => sum + (item.metrics.cost ?? 0), 0),
					batches: batches.length,
					toolCalls: emptyMetrics.toolCalls,
					rawChars,
					summaryChars: retried.reduce((sum, item) => sum + (item.metrics.summaryChars ?? 0), 0),
					modelId: resolvedModelId,
					errorKey: retried.some((item) => item.results.some(Boolean))
						? "engine.prune.error.multiBatchRetry"
						: "engine.prune.error.structuredSummaryMissing",
				},
				debug: {
					prompt: [userMessage, ...retried.map((item, index) => `--- retry ${index} ---\n${item.debug?.prompt ?? ""}`)].join("\n\n"),
					responseText: [text, ...retried.map((item, index) => `--- retry ${index} ---\n${item.debug?.responseText ?? ""}`)].join("\n\n"),
					maxTokens,
					acceptedSummaries: retried.flatMap((item) => item.debug?.acceptedSummaries ?? []),
				},
			};
		}
		let failSoftResults: Array<SummarizeResult | null> = hasUsableSummaries
			? results
			: batches.length === 1 && text.trim() && !looksLikeStructuredJsonAttempt(text)
				? [{ summaryText: text.trim(), usage }]
				: observationMaskResults(batches, "summary response did not contain usable structured summaries");

		if (!opts?.qualityRetry) {
			const invalidIndexes = failSoftResults
				.map((result, index) => result?.summaryText && needsQualityRetry(batches[index], result.summaryText, batchEvidence[index]) ? index : -1)
				.filter((index) => index >= 0);
			if (invalidIndexes.length > 0) {
				const retried = await Promise.all(invalidIndexes.map((index) =>
					summarizeToolBatchPool(
						pi,
						[batches[index]],
						{ ...config, promptOverride: `${config.promptOverride ?? DEFAULT_SUMMARIZER_SYSTEM_PROMPT}${QUALITY_RETRY_ADDENDUM}` },
						{ ...opts, qualityRetry: true },
					),
				));
				for (let i = 0; i < invalidIndexes.length; i++) {
					const replacement = retried[i]?.results?.[0] as SummarizeResult | null | undefined;
					if (replacement?.summaryText) failSoftResults[invalidIndexes[i]] = replacement;
				}
				return {
					results: failSoftResults,
					metrics: {
						requests: 1 + retried.reduce((sum, item) => sum + (item.metrics.requests ?? 0), 0),
						inputTokens: usage.input + retried.reduce((sum, item) => sum + (item.metrics.inputTokens ?? 0), 0),
						outputTokens: usage.output + retried.reduce((sum, item) => sum + (item.metrics.outputTokens ?? 0), 0),
						cacheReadTokens: (usage.cacheRead ?? 0) + retried.reduce((sum, item) => sum + (item.metrics.cacheReadTokens ?? 0), 0),
						cost: cost + retried.reduce((sum, item) => sum + (item.metrics.cost ?? 0), 0),
						batches: batches.length,
						toolCalls: emptyMetrics.toolCalls,
						rawChars,
						summaryChars: failSoftResults.reduce((sum, item) => sum + (item?.summaryText?.length ?? 0), 0),
						modelId: resolvedModelId,
						errorKey: "engine.prune.error.qualityRetryApplied",
					},
					debug: {
						prompt: [userMessage, ...retried.map((item, index) => `--- quality retry ${invalidIndexes[index]} ---\n${item.debug?.prompt ?? ""}`)].join("\n\n"),
						responseText: [text, ...retried.map((item, index) => `--- quality retry ${invalidIndexes[index]} ---\n${item.debug?.responseText ?? ""}`)].join("\n\n"),
						maxTokens,
						acceptedSummaries: failSoftResults.map((item) => item?.summaryText ?? "").filter(Boolean),
					},
				};
			}
		}

		return {
			results: failSoftResults,
			metrics: {
				requests: 1,
				inputTokens: usage.input,
				outputTokens: usage.output,
				cacheReadTokens: usage.cacheRead ?? 0,
				cost,
				batches: batches.length,
				toolCalls: emptyMetrics.toolCalls,
				rawChars,
				summaryChars: failSoftResults.reduce((sum, item) => sum + (item?.summaryText?.length ?? 0), 0),
				modelId: resolvedModelId,
				errorKey: hasUsableSummaries ? undefined : "engine.prune.error.structuredSummaryMissing",
			},
			debug: {
				prompt: userMessage,
				responseText: text,
				maxTokens,
				acceptedSummaries: failSoftResults.map((item) => item?.summaryText ?? "").filter(Boolean),
			},
		};
	} catch (err: any) {
		const message = err?.name === "AbortError" || err?.name === "TimeoutError" ? err.name : (err?.message ?? String(err));
		const masked = observationMaskResults(batches, message);
		return { results: masked, metrics: { ...emptyMetrics, summaryChars: masked.reduce((sum, item) => sum + item.summaryText.length, 0), errorKey: "engine.prune.error.summaryRequestFailed" }, debug: maskDebug(userMessage, maxTokens, masked) };
	}
}

/**
 * Compatibility wrapper: callers that only need summaries still get an array.
 */
export async function summarizeToolBatches(
	pi: any,
	batches: ToolBatch[],
	config: ToolPruneConfig,
	opts?: { signal?: AbortSignal; ctx?: any },
): Promise<Array<SummarizeResult | null>> {
	if (batches.length === 0) return [];
	return (await summarizeToolBatchPool(pi, batches, config, opts)).results;
}

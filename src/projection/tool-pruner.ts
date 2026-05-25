/**
 * Tool summarizer — calls LLM to summarize tool-call results.
 * Ported from pi-context-prune summarizer.ts.
 */
import { actualCostUsd, deepSeekOfficialCost } from "../stats.ts";
import { extractModelVisibleSection, isModelVisibleContext } from "../model-visible.ts";
import type { ToolBatch, SummarizePoolResult, SummarizeResult, ToolPruneConfig } from "./types.ts";

const SYSTEM_PROMPT = `You are rebuilding compact local context for tool-call batches made by an AI coding assistant.
Return strict JSON only:
{"summaries":[{"batchIndex":0,"summary":"..."}]}

Treat each summary as a self-contained replacement fragment for the pruned part of the session.
The fragment will be inserted back into conversation history where the tool-call batch originally happened.
Do not mimic the raw transcript. Reconstruct only the information future turns need.
Preserve exact file paths, identifiers, and constraints when they are present in tool arguments or results. Do not invent filenames, symbols, or modules.

For each batch, preserve:
- the immediate user goal or subtask that led to the tool calls
- tool names and what they did
- success/failure and the important returned data
- findings the future conversation needs
- negative constraints and safety rails such as "do not", "never", and "avoid"
- decisions reached, files inspected or modified, and open todos
- enough concrete evidence to continue work without rereading the raw tool output

When multiple batches in the same request revisit the same topic:
- treat higher batchIndex values as newer evidence
- if later evidence corrects, narrows, or disproves earlier findings, mark the earlier finding as provisional or superseded
- do not preserve disproved counts, filenames, symbols, or conclusions as active facts
- prefer durable settled conclusions over investigative dead ends

Skip turn-by-turn play-by-play. Do not emit tool calls, function-call markup, DSML, markdown headings, or SEARCH/REPLACE blocks.
Write each summary as a short continuation fragment:
- one line of local objective/context
- 1-3 short bullet points for the key tool findings
- one line for unresolved risk or next step, only if needed`;

const MAX_SUMMARY_RESULT_CHARS = 1200;
const DUPLICATE_SKIP_MARKER = "Дублирующийся вызов инструмента пропущен во избежание кэш-инвалидации/шума в контексте";

function compactResultForSummary(text: string, seenResults: Map<string, string>, toolName: string): string {
	const normalized = normalizeToolResultForSummary(text).trim();
	if (!normalized) return "";
	const dedupeKey = `${toolName}\n${normalized}`;
	const firstSeenTool = seenResults.get(dedupeKey);
	if (firstSeenTool) return `[same result as earlier ${firstSeenTool} output in this prune request]`;
	seenResults.set(dedupeKey, toolName);
	return normalized.slice(0, MAX_SUMMARY_RESULT_CHARS);
}

/**
 * Serialize a batch of tool calls for the summarizer.
 */
function serializeBatch(batch: ToolBatch, includeContext = true): string {
	const parts: string[] = [];
	const seenResults = new Map<string, string>();
	if (includeContext && batch.context) parts.push(`Batch timeline context:\n${batch.context.slice(0, 1200)}\n`);
	for (const tc of batch.toolCalls) {
		parts.push(`## ${tc.name}\n`);
		if (includeContext && tc.context) parts.push(`Call context: ${tc.context.slice(0, 600)}\n`);
		if (tc.args) parts.push(`Args: ${tc.args.slice(0, 500)}\n`);
		if (tc.result) {
			const compacted = compactResultForSummary(tc.result, seenResults, tc.name);
			if (compacted) parts.push(`Result: ${compacted}\n`);
		}
	}
	return parts.join("\n");
}

function stripLookupHeader(text: string): string {
	const newline = text.indexOf("\n");
	return newline >= 0 ? text.slice(newline + 1).trimStart() : text.trim();
}

export function normalizeToolResultForSummary(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	if (trimmed === DUPLICATE_SKIP_MARKER) return "";
	if (!isModelVisibleContext(trimmed)) return stripLookupHeader(trimmed);
	const lookup = extractModelVisibleSection(trimmed, "lookup");
	if (lookup) {
		const normalizedLookup = stripLookupHeader(lookup).trim();
		if (normalizedLookup && !normalizedLookup.startsWith("[context_result_lookup ")) return normalizedLookup;
	}
	const preview = extractModelVisibleSection(trimmed, "preview");
	if (preview) return preview.trim();
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

function summaryTokenBudgetForBatches(batches: ToolBatch[]): number {
	const rawChars = batches.reduce((sum, batch) => sum + estimateBatchReplacementChars(batch), 0);
	const rawTokens = Math.max(1, Math.ceil(rawChars / 4));
	const perBatchFloor = 128 * Math.max(1, batches.length);
	const compressionTarget = Math.ceil(rawTokens * 0.18);
	return Math.max(192, Math.min(1024, Math.max(perBatchFloor, compressionTarget)));
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
	if (!model) return { error: `summary model not found: ${modelId ?? "current"}` };
	const auth = await ctx?.modelRegistry?.getApiKeyAndHeaders?.(model);
	if (!auth?.ok) return { error: auth?.error ?? `no auth for summary model ${model.id ?? modelId ?? "current"}` };
	if (!auth.apiKey) return { error: `no API key for summary model ${model.provider ?? ""}/${model.id ?? modelId ?? "current"}` };
	const spec = "@earendil-works/pi-ai";
	const { complete } = await import(spec);
	const response = await complete(
		model,
		{ messages: [{ role: "user", content: [{ type: "text", text: userMessage }], timestamp: Date.now() }] },
		{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: opts?.maxTokens, signal: opts?.signal, reasoningEffort: opts?.reasoningEffort },
	);
	return { response, modelId: `${model.provider ?? ""}/${model.id ?? modelId ?? "current"}`.replace(/^\//, "") };
}

function buildPoolPrompt(batches: ToolBatch[], includeContext = true): string {
	const serialized = batches.map((batch, index) => [
		`<batch index="${index}" turn="${batch.turnIndex}">`,
		serializeBatch(batch, includeContext),
		"</batch>",
	].join("\n")).join("\n\n");
	return SYSTEM_PROMPT + "\n\n<tool-call-batches>\n" + serialized + "\n</tool-call-batches>";
}

function summaryTextFromItem(item: any): string {
	if (typeof item === "string") return item.trim();
	const content = contentText(item?.summary ?? item?.summaryText ?? item?.text ?? item?.content ?? item?.markdown);
	return content.trim();
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
	opts?: { signal?: AbortSignal; ctx?: any },
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
	opts?: { signal?: AbortSignal; ctx?: any },
): Promise<SummarizePoolResult> {
	const rawChars = batches.reduce((sum, batch) => sum + estimateBatchReplacementChars(batch), 0);
	const emptyMetrics = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, batches: batches.length, toolCalls: batches.reduce((sum, batch) => sum + batch.toolCalls.length, 0), rawChars, summaryChars: 0, modelId: resolveModel(config) };
	if (batches.length === 0) return { results: [], metrics: emptyMetrics };

	const includeContext = config.includeContext !== false;
	const userMessage = buildPoolPrompt(batches, includeContext);
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
			const completed = await completeWithPiAi(model, userMessage, { ctx: opts?.ctx, signal: combinedSignal, maxTokens, reasoningEffort: undefined });
			if (completed.error) return { results: batches.map(() => null), metrics: { ...emptyMetrics, error: completed.error } };
			response = completed.response;
			resolvedModelId = completed.modelId ?? model;
		}

		if (!response) return { results: batches.map(() => null), metrics: emptyMetrics };
		const text = responseContentText(response);
		if (!text || text.trim().length === 0) return { results: batches.map(() => null), metrics: emptyMetrics };

		const usage = readUsage(response, userMessage, text);
		const pricing = deepSeekOfficialCost(model);
		const cost = actualCostUsd({ input: usage.input, cacheRead: usage.cacheRead ?? 0, cacheWrite: 0, output: usage.output, cost: response?.usage?.cost?.total ?? response?.usage?.cost }, pricing);
		const parsed = extractJson(text);
		const summaries = extractSummaryItems(parsed);
		const results = batches.map((_, index) => {
			const item = summaries.find((summary: any) => Number(summary?.batchIndex ?? summary?.index) === index) ?? summaries[index];
			const summaryText = summaryTextFromItem(item) || (batches.length === 1 ? text.trim() : "");
			return summaryText ? { summaryText, usage } : null;
		});
		const hasUsableSummaries = results.some(Boolean);
		const failSoftResults = hasUsableSummaries
			? results
			: batches.map(() => text.trim() ? { summaryText: text.trim(), usage } : null);

		return {
			results: failSoftResults,
			metrics: {
				requests: 1,
				inputTokens: usage.input,
				outputTokens: usage.output,
				cost,
				batches: batches.length,
				toolCalls: emptyMetrics.toolCalls,
				rawChars,
				summaryChars: failSoftResults.reduce((sum, item) => sum + (item?.summaryText?.length ?? 0), 0),
				modelId: resolvedModelId,
				error: hasUsableSummaries ? undefined : "summary response used unstructured fallback",
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
		return { results: batches.map(() => null), metrics: { ...emptyMetrics, error: message } };
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

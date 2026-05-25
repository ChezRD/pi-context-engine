#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { complete, getModel } from "@earendil-works/pi-ai";

import { captureBatches, extractAssistantToolCalls } from "../src/projection/batch-capture.ts";
import { DEFAULT_SUMMARIZER_SYSTEM_PROMPT, buildPoolPrompt, summarizeToolBatchPool } from "../src/projection/tool-pruner.ts";

function usage() {
	console.error("usage: node scripts/replay_prune_session.mjs --session <path> [--model deepseek/deepseek-v4-flash] [--include-context true|false] [--bridge-length 2] [--batch-start 0] [--batch-count N] [--grep pattern] [--split-tool-calls N] [--max-batches-per-request N] [--prompt-file file] [--out-dir dir]");
	process.exit(1);
}

function parseArgs(argv) {
	const out = {
		includeContext: true,
		bridgeLength: 2,
		batchStart: 0,
		batchCount: undefined,
		listOnly: false,
		grep: undefined,
		splitToolCalls: undefined,
		maxBatchesPerRequest: undefined,
		promptFile: undefined,
		outDir: undefined,
		model: "deepseek/deepseek-v4-flash",
		session: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--session") out.session = next, i++;
		else if (arg === "--model") out.model = next, i++;
		else if (arg === "--include-context") out.includeContext = next !== "false", i++;
		else if (arg === "--bridge-length") out.bridgeLength = Number(next), i++;
		else if (arg === "--batch-start") out.batchStart = Number(next), i++;
		else if (arg === "--batch-count") out.batchCount = Number(next), i++;
		else if (arg === "--grep") out.grep = next, i++;
		else if (arg === "--split-tool-calls") out.splitToolCalls = Number(next), i++;
		else if (arg === "--max-batches-per-request") out.maxBatchesPerRequest = Number(next), i++;
		else if (arg === "--list") out.listOnly = true;
		else if (arg === "--prompt-file") out.promptFile = next, i++;
		else if (arg === "--out-dir") out.outDir = next, i++;
		else usage();
	}
	if (!out.session) usage();
	return out;
}

function readJsonl(file) {
	return fs.readFileSync(file, "utf8")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function normalizeBranch(entries) {
	const branch = [];
	let turnIndex = -1;
	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) continue;
		const msg = entry.message;
		if (msg.role === "assistant" && extractAssistantToolCalls(msg).length > 0) turnIndex++;
		branch.push({ message: msg, turnIndex: Math.max(0, turnIndex) });
	}
	return branch;
}

function batchText(batch) {
	return [
		batch.context ?? "",
		...batch.toolCalls.flatMap((toolCall) => [toolCall.name, toolCall.args ?? "", toolCall.result ?? "", toolCall.context ?? ""]),
	].join("\n");
}

function batchNeedsPartialCoverage(batch) {
	const joined = batch.toolCalls.map((toolCall) => `${toolCall.name}\n${toolCall.args ?? ""}\n${toolCall.result ?? ""}`).join("\n");
	const lookupRefs = new Set();
	const readSlicesByPath = new Map();
	const directPartial = batch.toolCalls.some((toolCall) => {
		const args = toolCall.args ?? "";
		const result = toolCall.result ?? "";
		const source = `${toolCall.name}\n${args}\n${result}`;
		const toolName = String(toolCall.name ?? "");
		const isLookupLike = /context_result_lookup/i.test(toolName)
			|| /\[context_result_lookup |returned_chars=|total_chars=|total_bytes=|has_more=true/i.test(source);
		if ((/^read$/i.test(toolName) || /^ffgrep$/i.test(toolName)) && /"limit"\s*:\s*\d+|"offset"\s*:\s*\d+/i.test(args)) {
			const returned = source.match(/returned_chars=(\d+)/i)?.[1];
			const totalChars = source.match(/total_chars=(\d+)/i)?.[1];
			const totalBytes = source.match(/total_bytes=(\d+)/i)?.[1] ?? source.match(/\bbytes=(\d+)/i)?.[1];
			const offset = Number(args.match(/"offset"\s*:\s*(\d+)/i)?.[1] ?? 0);
			const provesComplete = returned && ((totalChars && offset + Number(returned) >= Number(totalChars)) || (totalBytes && offset + Number(returned) >= Number(totalBytes)));
			if (!provesComplete) return true;
			if (/metadata_proves_complete=false|has_unfetched_tail=true|bounded_excerpt_without_total_proof=true|\[\.\.\. \d+ (?:more )?lines omitted \.\.\.\]|\[Showing lines .*Use offset=/i.test(source)) return true;
		}
		if (/^read$/i.test(toolName)) {
			const path = args.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
			if (path) {
				const offsetMatch = args.match(/"offset"\s*:\s*(\d+)/);
				const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
				const record = readSlicesByPath.get(path) ?? { count: 0, offsets: new Set(), sawStart: false, sawContinuationHint: false };
				record.count += 1;
				record.offsets.add(offset);
				if (offset <= 1) record.sawStart = true;
				if (/Use offset=\d+/i.test(result)) record.sawContinuationHint = true;
				readSlicesByPath.set(path, record);
			}
		}
		for (const match of source.matchAll(/dsc-[A-Za-z0-9-]+/g)) lookupRefs.add(match[0]);
		if (/full list not captured|never fetched|output was truncated/i.test(source)) return true;
		if (isLookupLike && /truncated|partial output/i.test(source)) return true;
		if (isLookupLike && /returned 0/i.test(source)) return true;
		if (!isLookupLike) return false;
		if (/has_more=true/i.test(result)) return true;
		const offsetMatch = args.match(/"offset"\s*:\s*(\d+)/);
		const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
		if (offset > 0) return true;
		if (/Use offset=\d+/i.test(result)) return true;
		return false;
	});
	const slicedReadDetected = Array.from(readSlicesByPath.values()).some((record) => {
		const positiveOffsets = Array.from(record.offsets).filter((offset) => offset > 0).length;
		return record.count >= 5 || (record.count >= 4 && positiveOffsets >= 2) || (record.sawStart && record.sawContinuationHint && record.count >= 4);
	});
	return directPartial || slicedReadDetected || (lookupRefs.size > 1 && /context_result_lookup|truncated|returned_chars|total_chars|total_bytes/i.test(joined));
}

function hasFalseCertainty(summary) {
	const lines = summary
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const unsafePatterns = [
		/\ball data verified\b/i,
		/\bfully verified\b/i,
		/\bcomplete capture\b/i,
		/\bcoverage:\s*complete\b/i,
		/\bcontiguous coverage (?:confirmed|achieved|verified)\b/i,
		/\bentire file (?:verified|confirmed|captured)\b/i,
		/\bfull file (?:verification|coverage|capture)\b/i,
	];
	const safeContext = /\b(partial|unknown|unsafe|not\b|never\b|missing|gap|unresolved|incomplete|skipped|not fetched|next step|cannot be complete)\b/i;
	return lines.some((line) => unsafePatterns.some((pattern) => pattern.test(line)) && !safeContext.test(line));
}

function hasOffsetLineInference(batch, summary) {
	const hasOffsetArgs = batch.toolCalls.some((toolCall) => /"offset"\s*:\s*\d+/.test(toolCall.args ?? ""));
	if (!hasOffsetArgs) return false;
	const normalizedSummary = summary.replace(/\boffsets?\s+\d+\s*[-–]\s*\d+/gi, "offset-range-ok");
	const explicitCharRange = /\bchars?\s+\d+\s*[-–]\s*\d+/i.test(summary) || /\boffset-range-ok\b/i.test(normalizedSummary);
	const resultHasExplicitLineLabels = batch.toolCalls.some((toolCall) =>
		/\bline(?:s)?\s+\d+\s*(?:[-–]|through|to)\s*\d+/i.test(toolCall.result ?? "")
		|| /\bline\s+\d+\b/i.test(toolCall.result ?? ""),
	);
	if (/\bread\s*\(\s*offset\s*=\s*\d+.*\)\s*returned\s+lines?\s+\d+/i.test(summary)
		|| /\boffset\s*=\s*\d+[^\n]*\blines?\s+\d+\s*[-–]\s*\d+/i.test(summary)
		|| /\boffset\s+\d+[^\n]*\blines?\s+\d+\s*[-–]\s*\d+/i.test(summary)
		|| /\bfirst\s+\d+\s+lines\b/i.test(summary)
		|| /\bvia\s+context_result_lookup[^\n]*\blines?\s+\d+\s*[-–]\s*\d+/i.test(summary)
		|| /\blines?\s+\d+\s*[-–]\s*\d+[^\n]*\bchars?\s+\d+\s*[-–]\s*\d+/i.test(summary)) {
		return true;
	}
	if (resultHasExplicitLineLabels && !/context_result_lookup/i.test(summary)) return false;
	if (explicitCharRange && !/\blines?\s+\d+\s*[-–]\s*\d+/i.test(summary)) return false;
	return /\blines?\s+\d+\s*(?:[-–]|through|to)\s*\d+/i.test(summary)
		|| /\breturned\s+\d+\s+lines\b/i.test(summary)
		|| /\boffsets?\s+interpreted as line numbers\b/i.test(summary);
}

function hasUnsupportedReadCompleteness(batch, summary) {
	const boundedReadPaths = new Set();
	const provenCompleteReadPaths = new Set();
	const pathKeysFor = (path) => {
		const parts = String(path).split("/").filter(Boolean);
		const basename = parts.at(-1);
		const suffix2 = parts.slice(-2).join("/");
		return Array.from(new Set([basename, suffix2].filter(Boolean)));
	};
	for (const toolCall of batch.toolCalls) {
		if (!/^read$/i.test(String(toolCall.name ?? ""))) continue;
		const args = toolCall.args ?? "";
		const path = args.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
		if (!path) continue;
		const keys = pathKeysFor(path);
		const result = toolCall.result ?? "";
		const returned = result.match(/returned_chars=(\d+)/i)?.[1];
		const totalChars = result.match(/total_chars=(\d+)/i)?.[1];
		const totalBytes = result.match(/total_bytes=(\d+)/i)?.[1];
		const offset = Number(args.match(/"offset"\s*:\s*(\d+)/i)?.[1] ?? 0);
		const isBounded = /"limit"\s*:\s*\d+|"offset"\s*:\s*\d+/i.test(args);
		if (isBounded) for (const key of keys) boundedReadPaths.add(key);
		if (returned && ((totalChars && offset + Number(returned) >= Number(totalChars)) || (totalBytes && offset + Number(returned) >= Number(totalBytes)))) {
			for (const key of keys) provenCompleteReadPaths.add(key);
		}
	}
	if (boundedReadPaths.size === 0) return false;
	const lines = summary.split(/\r?\n/);
	for (const line of lines) {
		if (!/\b(full|complete|fully read|entire)\b/i.test(line)) continue;
		if (/\b(not read|unread|remain unread|remaining|tail|partial|bounded excerpt|bounded excerpts|incomplete)\b/i.test(line)) continue;
		for (const name of boundedReadPaths) {
			if (line.includes(name) && !provenCompleteReadPaths.has(name)) return true;
		}
	}
	return false;
}

function summarizeBatchShape(batch, index) {
	return {
		index,
		turnIndex: batch.turnIndex,
		toolCount: batch.toolCalls.length,
		toolNames: batch.toolCalls.map((toolCall) => toolCall.name),
		contextPreview: (batch.context ?? batch.toolCalls[0]?.context ?? "").slice(0, 160),
		refs: batch.toolCalls.flatMap((toolCall) => {
			const source = `${toolCall.args ?? ""}\n${toolCall.result ?? ""}`;
			return Array.from(source.matchAll(/dsc-[A-Za-z0-9-]+/g)).map((match) => match[0]);
		}),
		needsPartial: batchNeedsPartialCoverage(batch),
	};
}

function splitBatch(batch, maxToolCalls) {
	if (!maxToolCalls || batch.toolCalls.length <= maxToolCalls) return [{ ...batch, sourceBatchIndex: undefined, subBatchIndex: undefined }];
	const split = [];
	for (let i = 0; i < batch.toolCalls.length; i += maxToolCalls) {
		split.push({
			turnIndex: batch.turnIndex,
			context: batch.context,
			toolCalls: batch.toolCalls.slice(i, i + maxToolCalls),
			sourceBatchIndex: undefined,
			subBatchIndex: split.length,
		});
	}
	return split;
}

function chunkArray(xs, size) {
	if (!size || size <= 0 || xs.length <= size) return [xs];
	const chunks = [];
	for (let i = 0; i < xs.length; i += size) chunks.push(xs.slice(i, i + size));
	return chunks;
}

function batchSourceRefs(batch) {
	return Array.from(new Set(batch.toolCalls.map((toolCall) => {
		const source = `${toolCall.args ?? ""}\n${toolCall.result ?? ""}`;
		return Array.from(source.matchAll(/dsc-[A-Za-z0-9-]+/g)).map((match) => match[0]);
	}).flat().filter(Boolean)));
}

function batchPathHints(batch) {
	return Array.from(new Set(batch.toolCalls.map((toolCall) => {
		const path = (toolCall.args ?? "").match(/"path"\s*:\s*"([^"]+)"/)?.[1];
		if (!path) return [];
		const parts = path.split("/").filter(Boolean);
		return [
			path,
			parts.at(-1),
			parts.slice(-2).join("/"),
			parts.slice(-3).join("/"),
		].filter(Boolean);
	}).flat()));
}

function chunkBatchesWithRefAffinity(batches, size) {
	if (!size || size <= 0 || batches.length <= size) return [batches];
	const chunks = [];
	let current = [];
	let currentRefs = new Set();
	for (const batch of batches) {
		const refs = batchSourceRefs(batch);
		const sharesRef = refs.some((ref) => currentRefs.has(ref));
		if (current.length >= size && !sharesRef) {
			chunks.push(current);
			current = [];
			currentRefs = new Set();
		}
		current.push(batch);
		for (const ref of refs) currentRefs.add(ref);
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

function refHintFromBatch(batch, ref) {
	for (const toolCall of batch.toolCalls) {
		const result = toolCall.result ?? "";
		if (!result.includes(ref)) continue;
		const body = result.split(/\r?\n/).slice(1).find((line) => line.trim());
		if (!body) continue;
		return body.trim().slice(0, 120);
	}
	return undefined;
}

function buildCarryForwardInventory(batches) {
	const inventory = new Map();
	for (const batch of batches) {
		for (const toolCall of batch.toolCalls) {
			const source = `${toolCall.args ?? ""}\n${toolCall.result ?? ""}`;
			const refs = Array.from(source.matchAll(/dsc-[A-Za-z0-9-]+/g)).map((match) => match[0]);
			const offsetMatch = (toolCall.args ?? "").match(/"offset"\s*:\s*(\d+)/);
			const offset = offsetMatch ? Number(offsetMatch[1]) : undefined;
			const totalCharsMatch = (toolCall.result ?? "").match(/\btotal_chars=(\d+)/);
			const totalBytesMatch = (toolCall.result ?? "").match(/\b(?:total_bytes|bytes)=(\d+)/);
			for (const ref of refs) {
				const item = inventory.get(ref) ?? { source_ref: ref, seen_in_prior_request: true, observed_offsets: [], total_chars: undefined, total_bytes: undefined, subject_hint: undefined };
				if (typeof offset === "number" && !item.observed_offsets.includes(offset)) item.observed_offsets.push(offset);
				if (totalCharsMatch) item.total_chars = Number(totalCharsMatch[1]);
				if (totalBytesMatch) item.total_bytes = Number(totalBytesMatch[1]);
				if (!item.subject_hint) item.subject_hint = refHintFromBatch(batch, ref);
				inventory.set(ref, item);
			}
		}
	}
	return Array.from(inventory.values()).sort((a, b) => a.source_ref.localeCompare(b.source_ref));
}

function evaluateBatch(batch, summary) {
	const needsPartial = batchNeedsPartialCoverage(batch);
	const coverageMatch = summary.match(/^Coverage:\s*(complete|partial|unknown)\b/im);
	const coverage = coverageMatch?.[1] ?? "";
	const offsetLineInference = hasOffsetLineInference(batch, summary);
	const refs = batchSourceRefs(batch);
	const pathHints = batchPathHints(batch);
	const refMentions = refs.filter((ref) => summary.includes(ref)).length;
	const pathMentions = pathHints.filter((hint) => hint && summary.includes(hint)).length;
	const weakRefGrounding = refs.length >= 3 && refMentions < Math.min(2, refs.length) && pathMentions < Math.min(2, pathHints.length || 0);
	const unsupportedReadCompleteness = hasUnsupportedReadCompleteness(batch, summary);
	return {
		needsPartial,
		coverage,
		hasCoverage: Boolean(coverage),
		accepted: Boolean(summary.trim()),
		falseCertainty: needsPartial ? hasFalseCertainty(summary) : false,
		partialSatisfied: !needsPartial || coverage === "partial" || coverage === "unknown",
		overConservativePartial: !needsPartial && coverage === "partial",
		offsetLineInference,
		weakRefGrounding,
		unsupportedReadCompleteness,
	};
}

function loadPrompt(file) {
	return file ? fs.readFileSync(file, "utf8") : DEFAULT_SUMMARIZER_SYSTEM_PROMPT;
}

function createPiComplete(modelSpec) {
	const auth = JSON.parse(fs.readFileSync(path.join(process.env.HOME ?? "", ".pi/agent/auth.json"), "utf8"));
	const slash = modelSpec.indexOf("/");
	const provider = slash >= 0 ? modelSpec.slice(0, slash) : "deepseek";
	const modelId = slash >= 0 ? modelSpec.slice(slash + 1) : modelSpec;
	const apiKey = auth?.[provider]?.key;
	if (!apiKey) throw new Error(`missing API key for provider ${provider}`);
	const model = getModel(provider, modelId);
	if (!model) throw new Error(`model not found: ${modelSpec}`);
	return async (_requestedModel, messages, options = {}) => {
		const content = typeof messages?.[0]?.content === "string"
			? [{ type: "text", text: messages[0].content }]
			: Array.isArray(messages?.[0]?.content)
				? messages[0].content
				: [{ type: "text", text: String(messages?.[0]?.content ?? "") }];
		const response = await complete(
			model,
			{ messages: [{ role: "user", content, timestamp: Date.now() }] },
			{ apiKey, maxTokens: options.maxTokens, signal: options.signal, reasoningEffort: options.reasoningEffort },
		);
		return response;
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const promptOverride = loadPrompt(args.promptFile);
	const entries = readJsonl(args.session);
	const branch = normalizeBranch(entries);
	const pruneState = { pendingBatches: [], batchStepCounter: 0 };
	captureBatches(branch, [], pruneState, branch.at(-1)?.turnIndex ?? 0, { bridgeLength: args.bridgeLength });

	let batches = pruneState.pendingBatches;
	if (args.grep) {
		const pattern = new RegExp(args.grep, "i");
		batches = batches.filter((batch) => pattern.test(batchText(batch)));
	}
	if (args.listOnly) {
		console.log(JSON.stringify(batches.map((batch, index) => summarizeBatchShape(batch, index)), null, 2));
		return;
	}
	batches = batches.slice(args.batchStart, args.batchCount ? args.batchStart + args.batchCount : undefined);
	if (batches.length === 0) throw new Error("no batches matched");
	const selectedBatchSummaries = batches.map((batch, index) => ({ sourceBatchIndex: args.batchStart + index, batch }));
	const replayBatches = selectedBatchSummaries.flatMap(({ sourceBatchIndex, batch }) =>
		splitBatch(batch, args.splitToolCalls).map((split, subBatchIndex) => ({
			...split,
			sourceBatchIndex,
			subBatchIndex,
		})),
	);

	const pi = { complete: createPiComplete(args.model) };
	const requestChunks = chunkBatchesWithRefAffinity(replayBatches, args.maxBatchesPerRequest);
	const chunkPools = [];
	for (let chunkIndex = 0; chunkIndex < requestChunks.length; chunkIndex++) {
		const chunk = requestChunks[chunkIndex];
		const priorBatches = requestChunks.slice(0, chunkIndex).flat();
		const carryForwardInventory = buildCarryForwardInventory(priorBatches);
		chunkPools.push(await summarizeToolBatchPool(
			pi,
			chunk,
			{
				enabled: true,
				pruneOn: "agent-message",
				summarizerModel: args.model,
				includeContext: args.includeContext,
				promptOverride,
				carryForwardInventory,
			},
		));
	}
	const pool = {
		results: chunkPools.flatMap((item) => item.results),
		metrics: {
			requests: chunkPools.reduce((sum, item) => sum + (item.metrics.requests ?? 0), 0),
			inputTokens: chunkPools.reduce((sum, item) => sum + (item.metrics.inputTokens ?? 0), 0),
			outputTokens: chunkPools.reduce((sum, item) => sum + (item.metrics.outputTokens ?? 0), 0),
			cacheReadTokens: chunkPools.reduce((sum, item) => sum + (item.metrics.cacheReadTokens ?? 0), 0),
			cost: chunkPools.reduce((sum, item) => sum + (item.metrics.cost ?? 0), 0),
			batches: replayBatches.length,
			toolCalls: replayBatches.reduce((sum, batch) => sum + batch.toolCalls.length, 0),
			rawChars: replayBatches.reduce((sum, batch) => sum + batchText(batch).length, 0),
			summaryChars: chunkPools.reduce((sum, item) => sum + (item.metrics.summaryChars ?? 0), 0),
			modelId: chunkPools.find((item) => item.metrics.modelId)?.metrics.modelId ?? args.model,
			error: chunkPools.map((item) => item.metrics.error).filter(Boolean)[0],
		},
		debug: {
			prompt: chunkPools.map((item, index) => `--- request ${index} ---\n${item.debug?.prompt ?? ""}`).join("\n\n"),
			responseText: chunkPools.map((item, index) => `--- request ${index} ---\n${item.debug?.responseText ?? ""}`).join("\n\n"),
			maxTokens: Math.max(0, ...chunkPools.map((item) => item.debug?.maxTokens ?? 0)),
			acceptedSummaries: chunkPools.flatMap((item) => item.debug?.acceptedSummaries ?? []),
		},
	};

	const evaluations = pool.results.map((result, index) => ({
		index,
		sourceBatchIndex: replayBatches[index].sourceBatchIndex,
		subBatchIndex: replayBatches[index].subBatchIndex,
		turnIndex: replayBatches[index].turnIndex,
		toolCount: replayBatches[index].toolCalls.length,
		contextPreview: (replayBatches[index].context ?? replayBatches[index].toolCalls[0]?.context ?? "").slice(0, 160),
		toolNames: replayBatches[index].toolCalls.map((toolCall) => toolCall.name),
		refs: summarizeBatchShape(replayBatches[index], index).refs,
		...evaluateBatch(replayBatches[index], result?.summaryText ?? ""),
		summary: result?.summaryText ?? "",
	}));

	if (args.outDir) {
		fs.mkdirSync(args.outDir, { recursive: true });
		fs.writeFileSync(path.join(args.outDir, "prompt.txt"), buildPoolPrompt(replayBatches, args.includeContext, promptOverride));
		fs.writeFileSync(path.join(args.outDir, "response.txt"), pool.debug?.responseText ?? "");
		fs.writeFileSync(path.join(args.outDir, "report.json"), JSON.stringify({ metrics: pool.metrics, evaluations }, null, 2));
	}

	const report = {
		session: args.session,
		model: args.model,
		batchCount: replayBatches.length,
		selectedBatchCount: batches.length,
		splitToolCalls: args.splitToolCalls ?? null,
		maxBatchesPerRequest: args.maxBatchesPerRequest ?? null,
		metrics: {
			...pool.metrics,
			cacheHitRatio: (() => {
				const total = (pool.metrics.inputTokens ?? 0) + (pool.metrics.cacheReadTokens ?? 0);
				return total > 0 ? (pool.metrics.cacheReadTokens ?? 0) / total : 0;
			})(),
		},
		evaluations,
	};
	console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack : String(error));
	process.exit(1);
});
